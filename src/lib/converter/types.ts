/**
 * Data model shared by the renderer, the converter and the theme writer.
 *
 * Images and CSS assets captured from the source page are referenced with
 * `h2h-asset:<id>` placeholders until the theme is written, because their
 * final URL depends on the destination (HubSpot File Manager or a zip).
 */

export const ASSET_SCHEME = "h2h-asset:";

export interface ImageValue {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  loading: "lazy" | "eager" | "disabled";
}

export interface LinkValue {
  url: { href: string; type: "EXTERNAL" | "EMAIL_ADDRESS" };
  open_in_new_tab: boolean;
  no_follow: boolean;
}

interface BaseField {
  name: string;
  label: string;
}

export type FieldDef =
  | (BaseField & { type: "text"; default: string })
  | (BaseField & { type: "richtext"; default: string })
  | (BaseField & { type: "image"; default: ImageValue })
  | (BaseField & { type: "link"; default: LinkValue })
  | (BaseField & {
      type: "group";
      children: FieldDef[];
      default: Record<string, unknown>[];
    });

export type ModuleKind = "header" | "footer" | "section";

export interface ModuleDef {
  /** Stable id inside a job. */
  id: string;
  /** Folder name in the theme, e.g. "hero" -> modules/hero.module */
  name: string;
  /** Label shown in the HubSpot page editor. */
  label: string;
  kind: ModuleKind;
  /** HubL for module.html. */
  hubl: string;
  fields: FieldDef[];
  /** Original section HTML, used for the preview in the web app. */
  previewHtml: string;
  /** Excluded modules are left out of the theme and the templates. */
  included: boolean;
  /** Hash of the original markup, used to share header/footer across pages. */
  hash: string;
}

export type LayoutNode =
  | { type: "static"; moduleId: string }
  | { type: "dnd"; areaName: string; open: string; close: string; moduleIds: string[] };

export interface PageDef {
  route: string;
  label: string;
  /** File name without extension, inside templates/. */
  templateName: string;
  /** Opening tags of the wrappers around the sections, outermost first. */
  wrapperOpen: string[];
  wrapperClose: string[];
  layout: LayoutNode[];
}

export interface AssetRef {
  id: string;
  fileName: string;
  contentType: string;
  /** Where the asset was found on the source page. */
  sourceUrl: string;
}

export interface ThemeModel {
  name: string;
  label: string;
  htmlLang: string;
  /** Attributes of the source <body>, serialized. */
  bodyAttrs: string;
  /** <link> tags for cross-origin stylesheets (fonts) and preconnects. */
  headLinks: string[];
  /** Concatenated CSS of the source page, with asset placeholders. */
  css: string;
  pages: PageDef[];
  modules: ModuleDef[];
  assets: AssetRef[];
  warnings: string[];
}

/** Output of the renderer for one route. */
export interface RenderedPage {
  route: string;
  url: string;
  title: string;
  html: string;
  css: string;
  headLinks: string[];
  htmlLang: string;
  bodyAttrs: string;
  assets: (AssetRef & { base64: string })[];
}
