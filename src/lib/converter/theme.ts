import { ASSET_SCHEME, type FieldDef, type ModuleDef, type ThemeModel } from "./types";

/**
 * Where captured assets end up:
 * - "theme": inside the theme's images/ folder (zip download);
 * - "url": already uploaded somewhere (HubSpot File Manager) — `urls` maps
 *   asset ids to their public URL.
 */
export type AssetMode = { kind: "theme" } | { kind: "url"; urls: Map<string, string> };

export type ThemeFiles = Map<string, string | Buffer>;

const ASSET_RE = new RegExp(`${ASSET_SCHEME.replace(":", "\\:")}([A-Za-z0-9_-]+)`, "g");

export function writeTheme(model: ThemeModel, mode: AssetMode, assetBytes?: Map<string, Buffer>): ThemeFiles {
  const files: ThemeFiles = new Map();
  const assetsById = new Map(model.assets.map((a) => [a.id, a]));
  const included = model.modules.filter((m) => m.included);
  const includedIds = new Set(included.map((m) => m.id));
  const firstTemplate = model.pages[0]?.templateName ?? "home";

  const assetFor = (id: string, from: "css" | "hubl" | "field"): string => {
    const asset = assetsById.get(id);
    if (!asset) return "";
    if (mode.kind === "url") return mode.urls.get(id) ?? asset.sourceUrl;
    if (from === "field") return asset.sourceUrl;
    if (from === "css") return `{% endraw %}{{ get_asset_url("../images/${asset.fileName}") }}{% raw %}`;
    return `{{ get_asset_url("/${model.name}/images/${asset.fileName}") }}`;
  };

  files.set(
    "theme.json",
    json({
      label: model.label,
      preview_path: `./templates/${firstTemplate}.html`,
      enable_domain_stylesheets: false,
      version: "1.0",
    }),
  );
  files.set("fields.json", json([]));

  const css = model.css.replace(ASSET_RE, (_m, id: string) => assetFor(id, "css"));
  files.set("css/main.css", `/* Captured from the source page by lovable-to-hubspot. */\n{% raw %}\n${css}\n{% endraw %}\n`);

  files.set("templates/layouts/base.html", baseLayout(model));

  for (const page of model.pages) {
    files.set(`templates/${page.templateName}.html`, pageTemplate(model, page.templateName, includedIds));
  }

  for (const mod of included) {
    const dir = `modules/${mod.name}.module`;
    files.set(`${dir}/module.html`, mod.hubl.replace(ASSET_RE, (_m, id: string) => assetFor(id, "hubl")) + "\n");
    files.set(`${dir}/fields.json`, json(mod.fields.map((f) => fieldJson(f, (id) => assetFor(id, "field")))));
    files.set(`${dir}/meta.json`, json(moduleMeta(mod)));
  }

  if (mode.kind === "theme" && assetBytes) {
    for (const asset of model.assets) {
      const bytes = assetBytes.get(asset.id);
      if (bytes) files.set(`images/${asset.fileName}`, bytes);
    }
  }
  return files;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function baseLayout(model: ThemeModel): string {
  return `<!--
  templateType: none
-->
<!doctype html>
<html lang="{{ html_lang or "${model.htmlLang}" }}" {{ html_lang_dir }}>
  <head>
    <meta charset="utf-8">
    <title>{{ page_meta.html_title or content.name }}</title>
    {% if page_meta.meta_description %}<meta name="description" content="{{ page_meta.meta_description }}">{% endif %}
    <meta name="viewport" content="width=device-width, initial-scale=1">
${model.headLinks.map((l) => `    ${l}`).join("\n")}
    {{ require_css(get_asset_url("../../css/main.css")) }}
    {{ standard_header_includes }}
  </head>
  <body${model.bodyAttrs ? ` ${model.bodyAttrs}` : ""}>
    {% block body %}{% endblock body %}
    {{ standard_footer_includes }}
  </body>
</html>
`;
}

function pageTemplate(model: ThemeModel, templateName: string, includedIds: Set<string>): string {
  const page = model.pages.find((p) => p.templateName === templateName)!;
  const byId = new Map(model.modules.map((m) => [m.id, m]));
  const lines: string[] = [];
  let depth = 1;
  const push = (s: string) => lines.push(`${"  ".repeat(depth)}${s}`);

  for (const open of page.wrapperOpen) {
    push(open);
    depth++;
  }
  for (const node of page.layout) {
    if (node.type === "static") {
      const mod = byId.get(node.moduleId);
      if (!mod || !includedIds.has(mod.id)) continue;
      push(`{% module "${mod.name.replace(/-/g, "_")}" path="../modules/${mod.name}" label="${mod.label}" %}`);
      continue;
    }
    if (node.open) {
      push(node.open);
      depth++;
    }
    push(`{% dnd_area "${node.areaName}" label="Main content" %}`);
    depth++;
    for (const id of node.moduleIds) {
      const mod = byId.get(id);
      if (!mod || !includedIds.has(mod.id)) continue;
      push(`{% dnd_section padding={"default": {"top": 0, "right": 0, "bottom": 0, "left": 0}} %}`);
      depth++;
      push(`{% dnd_module path="../modules/${mod.name}" %}{% end_dnd_module %}`);
      depth--;
      push(`{% end_dnd_section %}`);
    }
    depth--;
    push(`{% end_dnd_area %}`);
    if (node.close) {
      depth--;
      push(node.close);
    }
  }
  for (const close of page.wrapperClose) {
    depth--;
    push(close);
  }

  return `<!--
  templateType: page
  isAvailableForNewContent: true
  label: ${model.label} – ${page.label.replace(/-->/g, "")}
-->
{% extends "./layouts/base.html" %}
{% block body %}
${lines.join("\n")}
{% endblock body %}
`;
}

function moduleMeta(mod: ModuleDef) {
  return {
    label: mod.label,
    css_assets: [],
    external_js: [],
    global: false,
    help_text: "Imported from Lovable with lovable-to-hubspot.",
    host_template_types: ["PAGE"],
    js_assets: [],
    other_assets: [],
    tags: [],
    is_available_for_new_content: true,
  };
}

type Resolve = (assetId: string) => string;

function resolveSrc(src: string, resolve: Resolve): string {
  return src.startsWith(ASSET_SCHEME) ? resolve(src.slice(ASSET_SCHEME.length)) : src;
}

/** HubSpot field JSON for one field definition. */
export function fieldJson(field: FieldDef, resolve: Resolve): Record<string, unknown> {
  const base = { name: field.name, label: field.label, required: false, locked: false };
  switch (field.type) {
    case "text":
      return { ...base, type: "text", allow_new_line: false, show_emoji_picker: false, default: field.default };
    case "richtext":
      return { ...base, type: "richtext", enabled_features: [], default: field.default };
    case "image":
      return {
        ...base,
        type: "image",
        responsive: true,
        resizable: true,
        show_loading: true,
        default: { ...field.default, src: resolveSrc(field.default.src, resolve), size_type: "auto" },
      };
    case "link":
      return {
        ...base,
        type: "link",
        supported_types: ["EXTERNAL", "CONTENT", "FILE", "EMAIL_ADDRESS", "BLOG"],
        default: { ...field.default, url: { ...field.default.url, content_id: null } },
      };
    case "group": {
      const children = field.children.map((c) => fieldJson(c, resolve));
      const defaults = field.default.map((item) =>
        Object.fromEntries(
          field.children.map((c) => {
            const value = item[c.name];
            if (c.type === "image" && value && typeof value === "object") {
              const img = value as { src: string };
              return [c.name, { ...img, src: resolveSrc(img.src, resolve), size_type: "auto" }];
            }
            if (c.type === "link" && value && typeof value === "object") {
              const link = value as { url: Record<string, unknown> };
              return [c.name, { ...link, url: { ...link.url, content_id: null } }];
            }
            return [c.name, value];
          }),
        ),
      );
      return {
        ...base,
        type: "group",
        occurrence: { min: 1, max: null, default: defaults.length },
        children,
        default: defaults,
      };
    }
  }
}
