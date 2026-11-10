import type { CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type { ModuleKind } from "./types";

/**
 * Markup that only makes sense inside the Lovable runtime or the editor:
 * toasters, the "Edit with Lovable" badge, dev attributes, scripts.
 */
export function sanitize($: CheerioAPI): void {
  $("script, noscript, template, link[rel='modulepreload'], style").remove();
  $("#lovable-badge, [id^='lovable-badge'], a[href*='lovable.dev/projects']").remove();
  $("[data-sonner-toaster], section[aria-label^='Notifications'], ol[data-sonner-toaster]").remove();
  $("[data-radix-portal], [data-radix-popper-content-wrapper]").remove();

  $("*").each((_i, node) => {
    const el = node as Element;
    for (const name of Object.keys(el.attribs)) {
      if (
        name.startsWith("data-lov") ||
        name.startsWith("data-component-") ||
        name === "data-h2h-ignore"
      ) {
        delete el.attribs[name];
      }
    }
    const style = el.attribs.style;
    if (style) {
      // Elements still waiting for a scroll-triggered animation (framer-motion
      // and friends) are left at opacity 0. The static copy must be visible.
      const cleaned = style
        .split(";")
        .filter((decl) => {
          const [prop, value = ""] = decl.split(":").map((s) => s.trim().toLowerCase());
          if (prop === "opacity" && Number.parseFloat(value) < 1) return false;
          if (prop === "transform" && /translate|scale/.test(value) && /opacity\s*:\s*0/.test(style)) return false;
          if (prop === "will-change") return false;
          return prop.length > 0;
        })
        .join("; ");
      if (cleaned) el.attribs.style = cleaned;
      else delete el.attribs.style;
    }
  });
}

function elementChildren(el: Element): Element[] {
  return el.children.filter((c: AnyNode): c is Element => c.type === "tag");
}

function isChrome(el: Element, kind: "header" | "footer"): boolean {
  const role = el.attribs.role;
  if (kind === "header") return el.tagName === "header" || el.tagName === "nav" || role === "banner" || role === "navigation";
  return el.tagName === "footer" || role === "contentinfo";
}

export interface SectionPlan {
  /** Wrappers between #root and the list of top-level blocks. */
  wrappers: Element[];
  header: Element[];
  footer: Element[];
  /** The element that will host the drag-and-drop area, if not the wrapper. */
  main: Element | null;
  sections: Element[];
}

/**
 * Finds the page structure Lovable/Vite apps typically render:
 *   #root > div.min-h-screen > [Navbar, main > [Hero, Features…], Footer]
 * Single-child wrappers are kept as wrappers; the first element with several
 * children is where the sections live.
 */
export function planSections($: CheerioAPI): SectionPlan {
  const start = ($("#root").get(0) ?? $("body").get(0)) as Element | undefined;
  if (!start) throw new Error("The page has no <body>.");

  const wrappers: Element[] = [];
  let container = start;
  for (;;) {
    const kids = elementChildren(container);
    if (kids.length !== 1) break;
    const only = kids[0];
    if (only.tagName === "main" || isChrome(only, "header") || isChrome(only, "footer")) break;
    if (elementChildren(only).length === 0) break;
    wrappers.push(only);
    container = only;
  }

  let blocks = elementChildren(container);
  const header: Element[] = [];
  const footer: Element[] = [];
  while (blocks.length > 1 && isChrome(blocks[0], "header")) header.push(blocks.shift()!);
  while (blocks.length > 1 && isChrome(blocks.at(-1)!, "footer")) footer.unshift(blocks.pop()!);

  let main: Element | null = null;
  if (blocks.length === 1 && elementChildren(blocks[0]).length > 1) {
    main = blocks[0];
    blocks = elementChildren(main);
  }

  return { wrappers, header, footer, main, sections: blocks.filter((b) => !isEmpty($, b)) };
}

function isEmpty($: CheerioAPI, el: Element): boolean {
  return $(el).text().trim() === "" && $(el).find("img, svg, video, iframe, picture").length === 0;
}

export function kindOf(el: Element, plan: SectionPlan): ModuleKind {
  if (plan.header.includes(el)) return "header";
  if (plan.footer.includes(el)) return "footer";
  return "section";
}

/** Opening tag of an element, without its children. */
export function openTag(el: Element): string {
  const attrs = Object.entries(el.attribs)
    .map(([k, v]) => (v === "" ? ` ${k}` : ` ${k}="${v.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`))
    .join("");
  return `<${el.tagName}${attrs}>`;
}

export function closeTag(el: Element): string {
  return `</${el.tagName}>`;
}

/** A readable base name for a module, from its id, role or first heading. */
export function guessName($: CheerioAPI, el: Element, kind: ModuleKind, slugify: (s: string) => string): string {
  if (kind === "header") return "site-header";
  if (kind === "footer") return "site-footer";
  const id = el.attribs.id;
  if (id && /[a-z]/i.test(id)) return slugify(id);
  const aria = el.attribs["aria-label"];
  if (aria) return slugify(aria);
  const heading = $(el).find("h1, h2, h3").first().text();
  if (heading.trim()) return slugify(heading);
  return "section";
}
