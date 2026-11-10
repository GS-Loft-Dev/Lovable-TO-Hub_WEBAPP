import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { convertPages, type FieldDef, type RenderedPage } from "../src/lib/converter";
import { writeTheme } from "../src/lib/converter/theme";

const html = readFileSync(join(__dirname, "fixtures/landing.html"), "utf8");

const page: RenderedPage = {
  route: "/",
  url: "https://acme.lovable.app/",
  title: "Acme Fitness",
  html,
  css: ".card{padding:1rem}@media(min-width:768px){#root{background:url(h2h-asset:a2)}}",
  headLinks: ['<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">'],
  htmlLang: "it",
  bodyAttrs: 'class="antialiased"',
  assets: [
    { id: "a1", fileName: "gym.jpg", contentType: "image/jpeg", sourceUrl: "https://acme.lovable.app/assets/gym.jpg", base64: "" },
    { id: "a2", fileName: "bg.png", contentType: "image/png", sourceUrl: "https://acme.lovable.app/assets/bg.png", base64: "" },
  ],
};

const model = convertPages([page], { themeName: "Acme Fit" });
const byName = (n: string) => model.modules.find((m) => m.name === n)!;
const field = (fields: FieldDef[], name: string) => fields.find((f) => f.name === name)!;

describe("section planning", () => {
  it("finds header, sections and footer and drops empty sections", () => {
    expect(model.modules.map((m) => `${m.kind}:${m.name}`)).toEqual([
      "header:site-header",
      "section:hero",
      "section:features",
      "section:cosa-dicono-di-noi",
      "footer:site-footer",
    ]);
  });

  it("keeps the wrapper and the <main> element around the drag-and-drop area", () => {
    const p = model.pages[0];
    expect(p.wrapperOpen).toEqual(['<div class="min-h-screen bg-background">']);
    const dnd = p.layout.find((n) => n.type === "dnd");
    expect(dnd).toMatchObject({ open: "<main>", close: "</main>" });
  });
});

describe("field extraction", () => {
  const hero = byName("hero");

  it("turns headings with markup into rich text and plain text into text fields", () => {
    expect(field(hero.fields, "heading_1")).toMatchObject({ type: "richtext", default: "Allenati <strong>meglio</strong>, non di più" });
    expect(field(hero.fields, "text_2")).toMatchObject({ type: "text", default: "Il primo club con coach dedicato per ogni membro." });
    expect(hero.hubl).toContain("{{ module.heading_1 }}");
  });

  it("makes links editable, including target", () => {
    const link = field(hero.fields, "link_1");
    expect(link).toMatchObject({ type: "link", default: { url: { href: "https://acme.example/prova" }, open_in_new_tab: true } });
    expect(field(hero.fields, "link_1_text")).toMatchObject({ type: "text", default: "Prova gratis" });
    expect(hero.hubl).toContain('{% if module.link_1.open_in_new_tab %}target="_blank"{% endif %}');
    expect(hero.hubl).not.toContain("data-h2h");
  });

  it("makes images editable", () => {
    expect(field(hero.fields, "image_1")).toMatchObject({ type: "image", default: { src: "h2h-asset:a1", alt: "Sala pesi", width: 640, height: 480 } });
    expect(hero.hubl).toContain('src="{{ module.image_1.src }}"');
  });

  it("removes the opacity:0 left by scroll animations", () => {
    expect(hero.hubl).not.toMatch(/opacity:\s*0/);
  });

  it("turns identical cards into a repeater group", () => {
    const features = byName("features");
    const group = field(features.fields, "items_1");
    expect(group.type).toBe("group");
    if (group.type !== "group") return;
    expect(group.children.map((c) => c.name)).toEqual(["heading_1", "text_1"]);
    expect(group.default).toHaveLength(3);
    expect(group.default[1]).toEqual({ heading_1: "Aperti 24/7", text_1: "Allenati quando vuoi tu." });
    expect(features.hubl).toContain("{% for item in module.items_1 %}");
    expect(features.hubl).toContain("{{ item.heading_1|escape }}");
    expect(group.label).toBe("Repeated items 1 – Coach dedicato");
    expect(features.hubl.match(/class="card p-6"/g)).toHaveLength(1);
  });

  it("handles repeaters with images and captions", () => {
    const testimonials = byName("cosa-dicono-di-noi");
    const group = field(testimonials.fields, "items_1");
    expect(group.type === "group" && group.children.map((c) => c.type)).toEqual(["text", "text", "image"]);
  });

  it("neutralises HubL delimiters found in the source text", () => {
    const features = byName("features");
    const group = field(features.fields, "items_1");
    expect(group.type === "group" && group.default[2].text_1).toBe("Schede e progressi {{ sempre }} con te.");
  });

  it("handles mailto links in the footer", () => {
    const footer = byName("site-footer");
    expect(field(footer.fields, "link_1")).toMatchObject({ default: { url: { href: "info@acme.example", type: "EMAIL_ADDRESS" } } });
  });

  it("strips Lovable editor artefacts", () => {
    const all = model.modules.map((m) => m.hubl).join("\n");
    expect(all).not.toContain("data-lov");
    expect(all).not.toContain("lovable-badge");
    expect(model.pages[0].wrapperOpen.join("")).not.toContain("data-lov");
  });
});

describe("theme writer", () => {
  const files = writeTheme(model, { kind: "theme" }, new Map([["a1", Buffer.from("jpg")]]));

  it("writes a complete theme", () => {
    expect([...files.keys()].sort()).toEqual([
      "css/main.css",
      "fields.json",
      "images/gym.jpg",
      "modules/cosa-dicono-di-noi.module/fields.json",
      "modules/cosa-dicono-di-noi.module/meta.json",
      "modules/cosa-dicono-di-noi.module/module.html",
      "modules/features.module/fields.json",
      "modules/features.module/meta.json",
      "modules/features.module/module.html",
      "modules/hero.module/fields.json",
      "modules/hero.module/meta.json",
      "modules/hero.module/module.html",
      "modules/site-footer.module/fields.json",
      "modules/site-footer.module/meta.json",
      "modules/site-footer.module/module.html",
      "modules/site-header.module/fields.json",
      "modules/site-header.module/meta.json",
      "modules/site-header.module/module.html",
      "templates/home.html",
      "templates/layouts/base.html",
      "theme.json",
    ]);
  });

  it("builds a page template with static header/footer and a dnd area", () => {
    const tpl = files.get("templates/home.html") as string;
    expect(tpl).toContain("templateType: page");
    expect(tpl).toContain('{% module "site_header" path="../modules/site-header"');
    expect(tpl).toContain('{% dnd_area "main_area"');
    expect(tpl).toContain('{% dnd_module path="../modules/hero" %}{% end_dnd_module %}');
    expect(tpl.indexOf("<main>")).toBeLessThan(tpl.indexOf("dnd_area"));
  });

  it("protects CSS from HubL and points assets at the theme", () => {
    const css = files.get("css/main.css") as string;
    expect(css).toContain("{% raw %}");
    expect(css).toContain('{% endraw %}{{ get_asset_url("../images/bg.png") }}{% raw %}');
  });

  it("uses uploaded URLs when assets live in the File Manager", () => {
    const uploaded = writeTheme(model, { kind: "url", urls: new Map([["a1", "https://f.hubspotusercontent.com/gym.jpg"]]) });
    const heroFields = JSON.parse(uploaded.get("modules/hero.module/fields.json") as string);
    expect(heroFields.find((f: { name: string }) => f.name === "image_1").default.src).toBe("https://f.hubspotusercontent.com/gym.jpg");
    expect(uploaded.has("images/gym.jpg")).toBe(false);
  });

  it("leaves excluded modules out", () => {
    const m2 = { ...model, modules: model.modules.map((m) => (m.name === "features" ? { ...m, included: false } : m)) };
    const out = writeTheme(m2, { kind: "theme" });
    expect(out.has("modules/features.module/module.html")).toBe(false);
    expect(out.get("templates/home.html")).not.toContain("modules/features");
  });
});
