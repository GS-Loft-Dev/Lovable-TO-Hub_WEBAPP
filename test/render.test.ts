import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { convertPages } from "../src/lib/converter";
import { writeTheme } from "../src/lib/converter/theme";
import { findChrome, isAllowedUrl, renderRoutes } from "../src/lib/render";

const root = join(__dirname, "fixtures/site");
const types: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

let server: Server;
let base = "";

const hasChrome = (() => {
  try {
    findChrome();
    return true;
  } catch {
    return false;
  }
})();

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const path = normalize(new URL(req.url ?? "/", "http://x").pathname).replace(/^(\.\.[/\\])+/, "");
    const file = path.startsWith("/assets/") ? join(root, path) : join(root, "index.html");
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("host allowlist", () => {
  it("accepts Lovable hosts and rejects others by default", () => {
    expect(isAllowedUrl("https://acme.lovable.app/")).toBe(true);
    expect(isAllowedUrl("https://id-preview--x.lovable.app/")).toBe(true);
    expect(isAllowedUrl("https://evil.example/")).toBe(false);
    expect(isAllowedUrl("http://169.254.169.254/latest")).toBe(false);
    expect(isAllowedUrl("file:///etc/passwd", "*")).toBe(false);
  });
});

describe.runIf(hasChrome)("rendering a client-side app", () => {
  it("captures DOM, CSS and same-origin assets, then converts", async () => {
    const [page] = await renderRoutes({ url: `${base}/`, routes: ["/"] });

    expect(page.title).toBe("Spa Test");
    expect(page.htmlLang).toBe("it");
    expect(page.html).toContain("Rendered by JavaScript");
    expect(page.css).toContain(".card");
    expect(page.css).toMatch(/url\(h2h-asset:a\d+\)/);
    expect(page.headLinks.join()).toContain("fonts.googleapis.com");
    expect(page.assets.map((a) => a.sourceUrl).sort()).toEqual([`${base}/assets/bg.svg`, `${base}/assets/logo.svg`]);
    expect(page.html).toContain('href="/about?x=1"');

    const model = convertPages([page], { themeName: "spa" });
    expect(model.modules.map((m) => m.name)).toEqual(["site-header", "benvenuto", "servizi", "site-footer"]);
    const files = writeTheme(model, { kind: "theme" }, new Map(page.assets.map((a) => [a.id, Buffer.from(a.base64, "base64")])));
    expect(files.has(`images/${page.assets[0].fileName}`)).toBe(true);
    expect(files.get("modules/servizi.module/module.html")).not.toMatch(/opacity:\s*0/);
  }, 60_000);

  it("renders through an iframe host when an embed origin is given", async () => {
    const [page] = await renderRoutes({ url: `${base}/?__lovable_token=abc`, routes: ["/"], embedParentOrigin: "http://localhost:9",
      // The fixture server is on loopback; real Lovable previews are public.
      chromeArgs: ["--disable-features=LocalNetworkAccessChecks"],
    });
    expect(page.html).toContain("Rendered by JavaScript");
    expect(page.url).toContain("__lovable_token=abc");
  }, 60_000);
});
