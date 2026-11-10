import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { extractModule } from "./fields";
import { closeTag, guessName, kindOf, openTag, planSections, sanitize } from "./sections";
import type { AssetRef, LayoutNode, ModuleDef, PageDef, RenderedPage, ThemeModel } from "./types";
import { escapeHublDelimiters, shortHash, slugify, titleCase, uniqueName } from "./util";

export * from "./types";

export interface ConvertOptions {
  themeName: string;
  themeLabel?: string;
}

/**
 * Converts one or more rendered pages into a theme model. Modules with the
 * same markup (typically header and footer) are shared across pages.
 */
export function convertPages(pages: RenderedPage[], options: ConvertOptions): ThemeModel {
  if (pages.length === 0) throw new Error("Nothing to convert.");
  const themeName = slugify(options.themeName, 8) || "lovable-theme";
  const modules: ModuleDef[] = [];
  const byHash = new Map<string, ModuleDef>();
  const names = new Set<string>();
  const templateNames = new Set<string>();
  const warnings: string[] = [];
  const assets = new Map<string, AssetRef>();
  const cssParts: string[] = [];
  const headLinks = new Set<string>();

  const pageDefs: PageDef[] = pages.map((page) => {
    for (const a of page.assets) assets.set(a.id, { id: a.id, fileName: a.fileName, contentType: a.contentType, sourceUrl: a.sourceUrl });
    if (!cssParts.includes(page.css)) cssParts.push(page.css);
    page.headLinks.forEach((l) => headLinks.add(l));

    const $ = cheerio.load(page.html);
    sanitize($);
    const plan = planSections($);
    if (plan.sections.length === 0 && plan.header.length + plan.footer.length === 0) {
      warnings.push(`${page.route}: no sections found, the page looks empty.`);
    }

    const toModule = (el: Element): string => {
      const kind = kindOf(el, plan);
      const outer = $.html(el);
      const hash = shortHash(outer);
      const existing = byHash.get(hash);
      if (existing) return existing.id;

      const { hubl, fields } = extractModule($, el);
      const name = uniqueName(guessName($, el, kind, (s) => slugify(s)), names);
      const mod: ModuleDef = {
        id: `m_${hash}`,
        name,
        label: titleCase(name),
        kind,
        hubl,
        fields,
        previewHtml: outer,
        included: true,
        hash,
      };
      if (fields.length === 0) warnings.push(`${page.route}: "${mod.label}" has no editable content, it will be static.`);
      modules.push(mod);
      byHash.set(hash, mod);
      return mod.id;
    };

    const layout: LayoutNode[] = [];
    for (const el of plan.header) layout.push({ type: "static", moduleId: toModule(el) });
    layout.push({
      type: "dnd",
      areaName: "main_area",
      open: plan.main ? escapeHublDelimiters(openTag(plan.main)) : "",
      close: plan.main ? closeTag(plan.main) : "",
      moduleIds: plan.sections.map(toModule),
    });
    for (const el of plan.footer) layout.push({ type: "static", moduleId: toModule(el) });

    const routeSlug = page.route === "/" ? "home" : slugify(page.route.replace(/\//g, " "), 6) || "page";
    return {
      route: page.route,
      label: page.title || titleCase(routeSlug),
      templateName: uniqueName(routeSlug, templateNames),
      wrapperOpen: plan.wrappers.map((w) => escapeHublDelimiters(openTag(w))),
      wrapperClose: plan.wrappers.map(closeTag).reverse(),
      layout,
    };
  });

  const first = pages[0];
  return {
    name: themeName,
    label: options.themeLabel?.trim() || titleCase(themeName),
    htmlLang: first.htmlLang || "en",
    bodyAttrs: first.bodyAttrs,
    headLinks: [...headLinks],
    css: cssParts.join("\n"),
    pages: pageDefs,
    modules,
    assets: [...assets.values()],
    warnings,
  };
}
