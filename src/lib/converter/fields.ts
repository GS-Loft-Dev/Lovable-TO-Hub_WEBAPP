import type { CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type { FieldDef, ImageValue, LinkValue } from "./types";
import { escapeHublDelimiters, snippet } from "./util";

/**
 * Turns one section of rendered HTML into a HubSpot module: editable fields
 * for texts, images and links, and repeater groups for lists of identical
 * items (cards, features, testimonials…).
 *
 * The DOM is rewritten in place with opaque tokens; the tokens are swapped for
 * HubL after serialisation, so cheerio never has to escape template syntax.
 */

const INLINE = new Set([
  "strong", "em", "b", "i", "u", "s", "br", "span", "small", "code",
  "sup", "sub", "mark", "abbr", "time", "wbr", "del", "ins", "q", "cite",
]);

const TEXTISH = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "li", "a", "button",
  "label", "small", "strong", "blockquote", "figcaption", "dt", "dd",
  "td", "th", "cite", "q",
]);

/** Elements copied as-is, never searched for fields. */
const OPAQUE = new Set([
  "script", "style", "svg", "noscript", "iframe", "video", "audio",
  "canvas", "input", "select", "textarea", "picture", "template", "math",
]);

const ROLE_LABEL: Record<string, string> = {
  heading: "Heading",
  text: "Text",
  button: "Button",
  link: "Link",
  image: "Image",
  items: "Repeated items",
};

class Tokens {
  private map = new Map<string, string>();
  private n = 0;
  add(hubl: string): string {
    const token = `H2HTOK${this.n++}X`;
    this.map.set(token, hubl);
    return token;
  }
  apply(html: string): string {
    return html.replace(/H2HTOK\d+X/g, (t) => this.map.get(t) ?? t);
  }
}

interface Scope {
  /** "module" at top level, "item" inside a repeater loop. */
  prefix: string;
  fields: FieldDef[];
  counters: Map<string, number>;
  inGroup: boolean;
}

function newScope(prefix: string, inGroup: boolean): Scope {
  return { prefix, fields: [], counters: new Map(), inGroup };
}

function nextName(scope: Scope, role: string): string {
  const n = (scope.counters.get(role) ?? 0) + 1;
  scope.counters.set(role, n);
  return `${role}_${n}`;
}

function label(role: string, name: string, text: string): string {
  const num = name.split("_").pop();
  const base = `${ROLE_LABEL[role] ?? role} ${num}`;
  const hint = snippet(text);
  return hint ? `${base} – ${hint}` : base;
}

function isElement(node: AnyNode): node is Element {
  return node.type === "tag" || node.type === "script" || node.type === "style";
}

function elementChildren(el: Element): Element[] {
  return el.children.filter(isElement);
}

function isInlineOnly(el: Element): boolean {
  return el.children.every((child) => {
    if (child.type === "text" || child.type === "comment") return true;
    if (!isElement(child)) return false;
    return INLINE.has(child.tagName) && isInlineOnly(child);
  });
}

function textOf($: CheerioAPI, el: Element): string {
  return $(el).text().replace(/\s+/g, " ").trim();
}

/** Structural fingerprint used to recognise repeated items. */
function signature(el: Element): string {
  const cls = (el.attribs.class ?? "").split(/\s+/).filter(Boolean).sort().join(".");
  if (OPAQUE.has(el.tagName)) return `${el.tagName}.${cls}`;
  return `${el.tagName}.${cls}[${elementChildren(el).map(signature).join(",")}]`;
}

function hasEditableContent($: CheerioAPI, el: Element): boolean {
  return textOf($, el).length > 0 || $(el).find("img").length > 0 || el.tagName === "img";
}

function linkValue(href: string, target?: string): LinkValue {
  const isMail = href.startsWith("mailto:");
  return {
    url: {
      href: isMail ? href.slice("mailto:".length) : href,
      type: isMail ? "EMAIL_ADDRESS" : "EXTERNAL",
    },
    open_in_new_tab: target === "_blank",
    no_follow: false,
  };
}

export interface ExtractResult {
  hubl: string;
  fields: FieldDef[];
}

export function extractModule($: CheerioAPI, section: Element): ExtractResult {
  const tokens = new Tokens();
  const scope = newScope("module", false);
  const root = $(section).clone();
  const rootEl = root.get(0) as Element;
  walk($, rootEl, scope, tokens);
  const html = finalizeAttributes(escapeHublDelimiters($.html(root)));
  return { hubl: tokens.apply(html), fields: scope.fields };
}

function walk($: CheerioAPI, el: Element, scope: Scope, tokens: Tokens): void {
  const tag = el.tagName;
  if (OPAQUE.has(tag)) return;

  if (tag === "img") return imageField($, el, scope, tokens);

  if (tag === "a" && el.attribs.href) {
    linkField($, el, scope, tokens);
    if (qualifiesAsText($, el, scope)) textField($, el, scope, tokens, `${scope.fields.at(-1)!.name}_text`, "button");
    else walkChildren($, el, scope, tokens);
    return;
  }

  if (qualifiesAsText($, el, scope)) {
    const role = /^h[1-6]$/.test(tag) ? "heading" : tag === "button" ? "button" : "text";
    return textField($, el, scope, tokens, nextName(scope, role), role);
  }

  walkChildren($, el, scope, tokens);
}

function walkChildren($: CheerioAPI, el: Element, scope: Scope, tokens: Tokens): void {
  if (!scope.inGroup && tryRepeater($, el, scope, tokens)) return;
  for (const child of elementChildren(el)) walk($, child, scope, tokens);
}

function qualifiesAsText($: CheerioAPI, el: Element, scope: Scope): boolean {
  if (!isInlineOnly(el)) return false;
  if (textOf($, el).length > 0) return true;
  // Inside repeaters an item may have an empty text where its siblings
  // have one; keep the field so every item exposes the same fields.
  return scope.inGroup && TEXTISH.has(el.tagName) && elementChildren(el).length === 0;
}

function textField(
  $: CheerioAPI,
  el: Element,
  scope: Scope,
  tokens: Tokens,
  name: string,
  role: string,
): void {
  const hasMarkup = elementChildren(el).length > 0;
  const text = textOf($, el);
  if (hasMarkup) {
    scope.fields.push({
      type: "richtext",
      name,
      label: label(role, name, text),
      default: $(el).html()?.trim() ?? "",
    });
  } else {
    scope.fields.push({ type: "text", name, label: label(role, name, text), default: text });
  }
  const expr = hasMarkup ? `${scope.prefix}.${name}` : `${scope.prefix}.${name}|escape`;
  $(el).empty().append(tokens.add(`{{ ${expr} }}`));
}

function imageField($: CheerioAPI, el: Element, scope: Scope, tokens: Tokens): void {
  const name = nextName(scope, "image");
  const attrs = el.attribs;
  const width = Number.parseInt(attrs.width ?? attrs["data-h2h-w"] ?? "", 10);
  const height = Number.parseInt(attrs.height ?? attrs["data-h2h-h"] ?? "", 10);
  const value: ImageValue = {
    src: attrs.src ?? "",
    alt: attrs.alt ?? "",
    loading: attrs.loading === "eager" ? "eager" : "lazy",
    ...(Number.isFinite(width) && width > 0 ? { width } : {}),
    ...(Number.isFinite(height) && height > 0 ? { height } : {}),
  };
  scope.fields.push({ type: "image", name, label: label("image", name, value.alt), default: value });

  const ref = `${scope.prefix}.${name}`;
  const $el = $(el);
  $el.removeAttr("srcset").removeAttr("sizes").removeAttr("data-h2h-w").removeAttr("data-h2h-h");
  $el.attr("src", tokens.add(`{{ ${ref}.src }}`));
  $el.attr("alt", tokens.add(`{{ ${ref}.alt|escape }}`));
  $el.removeAttr("width").removeAttr("height").removeAttr("loading");
  $el.attr(
    "data-h2h-dim",
    tokens.add(
      `{% if ${ref}.width %}width="{{ ${ref}.width }}"{% endif %} ` +
        `{% if ${ref}.height %}height="{{ ${ref}.height }}"{% endif %} ` +
        `{% if ${ref}.loading != "disabled" %}loading="{{ ${ref}.loading }}"{% endif %}`,
    ),
  );
}

function linkField($: CheerioAPI, el: Element, scope: Scope, tokens: Tokens): void {
  const name = nextName(scope, "link");
  const href = el.attribs.href;
  const value = linkValue(href, el.attribs.target);
  scope.fields.push({ type: "link", name, label: label("link", name, textOf($, el) || href), default: value });
  const ref = `${scope.prefix}.${name}`;
  const $el = $(el);
  $el.removeAttr("target").removeAttr("rel");
  $el.attr(
    "href",
    tokens.add(
      `{% if ${ref}.url.type == "EMAIL_ADDRESS" %}mailto:{% endif %}{{ ${ref}.url.href }}`,
    ),
  );
  $el.attr(
    "data-h2h-target",
    tokens.add(
      `{% if ${ref}.open_in_new_tab %}target="_blank"{% endif %} ` +
        `{% if ${ref}.no_follow or ${ref}.open_in_new_tab %}rel="{% if ${ref}.no_follow %}nofollow {% endif %}noopener"{% endif %}`,
    ),
  );
}

/**
 * If `el` has two or more children with the same structure, turns them into
 * a repeater group rendered with a HubL for-loop. Returns false (and leaves
 * the DOM untouched) when the children don't line up.
 */
function tryRepeater($: CheerioAPI, el: Element, scope: Scope, tokens: Tokens): boolean {
  const items = elementChildren(el);
  if (items.length < 2) return false;
  if (items.some((i) => OPAQUE.has(i.tagName))) return false;
  const sig = signature(items[0]);
  if (!items.every((i) => signature(i) === sig)) return false;
  if (!items.every((i) => hasEditableContent($, i))) return false;

  const groupName = nextName(scope, "items");
  const processed = items.map((item) => {
    const clone = $(item).clone();
    const itemScope = newScope("item", true);
    walk($, clone.get(0) as Element, itemScope, tokens);
    return { clone, fields: itemScope.fields };
  });

  const names = (f: FieldDef[]) => f.map((x) => `${x.type}:${x.name}`).join("|");
  const first = names(processed[0].fields);
  if (!first || !processed.every((p) => names(p.fields) === first)) {
    // Undo the counter bump: this element is walked as plain children.
    scope.counters.set("items", (scope.counters.get("items") ?? 1) - 1);
    return false;
  }

  const children = processed[0].fields;
  const defaults = processed.map((p) =>
    Object.fromEntries(p.fields.map((f) => [f.name, f.default])),
  );
  scope.fields.push({
    type: "group",
    name: groupName,
    label: label("items", groupName, $(items[0]).find("h1, h2, h3, h4, h5, h6").first().text() || textOf($, items[0])),
    children,
    default: defaults,
  });

  const ref = `${scope.prefix}.${groupName}`;
  $(items[0]).replaceWith(processed[0].clone);
  for (const item of items.slice(1)) $(item).remove();
  processed[0].clone.before(tokens.add(`{% for item in ${ref} %}`));
  processed[0].clone.after(tokens.add(`{% endfor %}`));
  return true;
}

/**
 * Placeholder attributes hold a token for a whole HubL attribute string
 * (e.g. conditional target="_blank"); unwrap them before tokens are applied.
 */
function finalizeAttributes(html: string): string {
  return html.replace(/ data-h2h-(?:dim|target)="(H2HTOK\d+X)"/g, " $1");
}
