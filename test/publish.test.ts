import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { convertPages } from "../src/lib/converter";
import { publishToHubSpot } from "../src/lib/publish";

const html = readFileSync(join(__dirname, "fixtures/landing.html"), "utf8");
const model = convertPages(
  [
    {
      route: "/",
      url: "https://acme.lovable.app/",
      title: "Acme",
      html,
      css: ".x{background:url(h2h-asset:a1)}",
      headLinks: [],
      htmlLang: "it",
      bodyAttrs: "",
      assets: [{ id: "a1", fileName: "a1-gym.jpg", contentType: "image/jpeg", sourceUrl: "https://acme.lovable.app/gym.jpg", base64: "" }],
    },
  ],
  { themeName: "acme" },
);

const conn = { token: "tok", portalId: 123 };

afterEach(() => vi.unstubAllGlobals());

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET" });
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
    return handler(url, init);
  });
  return calls;
}

describe("publishToHubSpot", () => {
  it("uploads images to the File Manager, then validates and writes theme files in order", async () => {
    const calls = mockFetch((url) =>
      url.endsWith("/files/v3/files")
        ? Response.json({ url: "https://123.fs1.hubspotusercontent-eu1.net/hubfs/123/a1-gym.jpg" })
        : new Response("", { status: 200 }),
    );

    const result = await publishToHubSpot(conn, model, new Map([["a1", Buffer.from("img")]]));

    expect(result.ok).toBe(true);
    expect(calls[0]).toEqual({ url: "https://api.hubapi.com/files/v3/files", method: "POST" });
    const writes = calls.filter((c) => c.method === "PUT").map((c) => c.url.replace("https://api.hubapi.com/cms/v3/source-code/published/content/", ""));
    expect(writes[0]).toBe("acme/theme.json");
    expect(writes.indexOf("acme/modules/hero.module/meta.json")).toBeLessThan(writes.indexOf("acme/modules/hero.module/module.html"));
    expect(writes.at(-1)).toBe("acme/templates/home.html");
    expect(calls.some((c) => c.url.endsWith("/published/validate/acme/templates/home.html") && c.method === "POST")).toBe(true);
    expect(result.designManagerUrl).toBe("https://app.hubspot.com/design-manager/123");
  });

  it("reports HubL validation errors per file and keeps going", async () => {
    mockFetch((url) => {
      if (url.includes("/validate/acme/modules/hero.module/module.html")) {
        return Response.json({ message: "Validation failed", validationResults: [{ message: "Unclosed tag", lineNumber: 4 }] }, { status: 400 });
      }
      if (url.endsWith("/files/v3/files")) return Response.json({ url: "https://cdn/x.jpg" });
      return new Response("", { status: 200 });
    });

    const result = await publishToHubSpot(conn, model, new Map([["a1", Buffer.from("img")]]));
    expect(result.ok).toBe(false);
    const failed = result.steps.filter((s) => s.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].path).toBe("acme/modules/hero.module/module.html");
    expect(failed[0].error).toContain("line 4: Unclosed tag");
    expect(result.steps.find((s) => s.path === "acme/templates/home.html")?.status).toBe("uploaded");
  });

  it("explains missing scopes", async () => {
    mockFetch(() => Response.json({ message: "This app hasn't been granted all required scopes" }, { status: 403 }));
    const result = await publishToHubSpot(conn, model, new Map());
    expect(result.steps.find((s) => s.status === "failed")?.error).toContain("missing scope");
  });
});
