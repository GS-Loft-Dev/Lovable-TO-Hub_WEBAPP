import { createHash } from "node:crypto";

export function slugify(input: string, maxWords = 4): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, maxWords)
    .join("-");
  return slug;
}

export function titleCase(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function snippet(text: string, max = 32): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function shortHash(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 12);
}

/** Returns `base`, or `base-2`, `base-3`… if already taken. */
export function uniqueName(base: string, taken: Set<string>): string {
  let name = base || "section";
  let n = 2;
  while (taken.has(name)) name = `${base}-${n++}`;
  taken.add(name);
  return name;
}

/**
 * Static markup is copied into HubL files verbatim, so any sequence HubL
 * would interpret ({{ }}, {% %}, {# #}) has to be neutralised first.
 */
export function escapeHublDelimiters(html: string): string {
  return html.replace(/\{(?=[{%#])/g, "&#123;");
}
