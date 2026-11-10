import { existsSync } from "node:fs";
import { chromium, type Browser, type Frame, type Page } from "playwright-core";
import type { RenderedPage } from "./converter/types";

const CHROME_CANDIDATES = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

export function findChrome(): string {
  const fromEnv = process.env.CHROME_PATH?.trim();
  if (fromEnv) return fromEnv;
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) throw new Error("Chrome/Chromium not found. Install it or set CHROME_PATH.");
  return found;
}

/** Host allowlist: the server opens these URLs, so keep it tight on public instances. */
export function isAllowedUrl(raw: string, patterns = process.env.RENDER_ALLOWED_HOSTS ?? "*.lovable.app,*.lovableproject.com,*.lovable.dev"): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  return patterns
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .some((p) => {
      if (p === "*") return true;
      if (p.startsWith("*.")) return host === p.slice(2) || host.endsWith(p.slice(1));
      return host === p;
    });
}

export interface RenderOptions {
  /** Absolute URL of the page to open; for embeds, the embed URL with its token. */
  url: string;
  routes: string[];
  /** Lovable embed URLs only load inside an iframe on this HTTPS origin. */
  embedParentOrigin?: string;
  viewport?: { width: number; height: number };
  timeoutMs?: number;
  /** Extra Chromium flags (used by tests to reach loopback servers). */
  chromeArgs?: string[];
}

/** Default pack for @sparticuz/chromium-min; must match the installed package version. */
const DEFAULT_CHROMIUM_PACK =
  "https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar";

/** True inside AWS Lambda-style runtimes (Netlify Functions, Vercel, Lambda). */
export function isServerless(): boolean {
  return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT || process.env.NETLIFY);
}

/**
 * Three ways to get a browser, in order:
 * 1. BROWSER_WS_ENDPOINT: a remote browser (Browserless, Steel, your own);
 * 2. serverless: @sparticuz/chromium-min, which downloads a Lambda-compatible
 *    Chromium to /tmp on cold start (CHROMIUM_PACK_URL);
 * 3. a local Chrome/Chromium (CHROME_PATH or auto-detected).
 */
async function launchBrowser(extraArgs: string[]): Promise<{ browser: Browser; cleanup: () => Promise<void> }> {
  const ws = process.env.BROWSER_WS_ENDPOINT?.trim();
  if (ws) {
    const browser = await chromium.connectOverCDP(ws, { timeout: 30_000 });
    return { browser, cleanup: () => browser.close() };
  }

  if (process.env.CHROMIUM_PACK_URL || isServerless()) {
    const { default: lambdaChromium } = await import("@sparticuz/chromium-min");
    const { readdir, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const browser = await chromium.launch({
      executablePath: await lambdaChromium.executablePath(process.env.CHROMIUM_PACK_URL?.trim() || DEFAULT_CHROMIUM_PACK),
      args: [...lambdaChromium.args, ...extraArgs],
      headless: true,
    });
    return {
      browser,
      cleanup: async () => {
        await browser.close();
        // Warm invocations reuse /tmp; leftover Playwright profiles would fill it up.
        const tmp = tmpdir();
        for (const name of await readdir(tmp).catch(() => [] as string[])) {
          if (name.startsWith("playwright_chromiumdev_profile-")) await rm(join(tmp, name), { recursive: true, force: true });
        }
      },
    };
  }

  const browser = await chromium.launch({
    executablePath: findChrome(),
    args: ["--no-sandbox", "--disable-dev-shm-usage", ...extraArgs],
  });
  return { browser, cleanup: () => browser.close() };
}

export async function renderRoutes(opts: RenderOptions): Promise<RenderedPage[]> {
  const { browser, cleanup } = await launchBrowser(opts.chromeArgs ?? []);
  try {
    const out: RenderedPage[] = [];
    for (const route of opts.routes) out.push(await renderOne(browser, opts, route));
    return out;
  } finally {
    await cleanup();
  }
}

function routeUrl(base: string, route: string): string {
  const url = new URL(base);
  const r = new URL(route || "/", url.origin);
  url.pathname = r.pathname;
  if (r.hash) url.hash = r.hash;
  return url.toString();
}

async function renderOne(browser: Browser, opts: RenderOptions, route: string): Promise<RenderedPage> {
  const timeout = opts.timeoutMs ?? (Number(process.env.RENDER_TIMEOUT_MS) || 45_000);
  const viewport = opts.viewport ?? { width: 1440, height: 900 };
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
  const target = routeUrl(opts.url, route);

  try {
    let frame: Frame;
    if (opts.embedParentOrigin) {
      frame = await openInIframe(page, opts.embedParentOrigin, target, timeout);
    } else {
      await page.goto(target, { waitUntil: "networkidle", timeout }).catch(async () => {
        await page.goto(target, { waitUntil: "load", timeout });
      });
      frame = page.mainFrame();
    }

    await frame.waitForSelector("#root > *, body > *", { timeout }).catch(() => undefined);
    await autoScroll(frame);
    const captured = await frame.evaluate(capturePage);
    return { route, url: target, ...captured };
  } finally {
    await context.close();
  }
}

/**
 * Serves a tiny host page on the app's own origin (intercepted, never hits the
 * network) that frames the Lovable embed URL, then returns the inner frame.
 */
async function openInIframe(page: Page, parentOrigin: string, target: string, timeout: number): Promise<Frame> {
  const hostUrl = `${parentOrigin.replace(/\/$/, "")}/__h2h_render_host__`;
  await page.route(hostUrl, (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body style="margin:0"><iframe id="f" src="${target.replace(/"/g, "&quot;")}" style="border:0;width:100vw;height:100vh;display:block"></iframe></body></html>`,
    }),
  );
  await page.goto(hostUrl, { waitUntil: "load", timeout });
  const targetOrigin = new URL(target).origin;
  const deadline = Date.now() + timeout;
  for (;;) {
    const frame = page.frames().find((f) => f !== page.mainFrame() && f.url().startsWith(targetOrigin));
    if (frame) {
      await frame.waitForLoadState("networkidle", { timeout }).catch(() => undefined);
      return frame;
    }
    if (Date.now() > deadline) throw new Error("The Lovable preview did not load in time.");
    await page.waitForTimeout(250);
  }
}

/** Scrolls to the bottom so scroll-triggered content and lazy images load. */
async function autoScroll(frame: Frame): Promise<void> {
  await frame.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(200, Math.floor(window.innerHeight * 0.7));
    for (let y = 0; y < document.documentElement.scrollHeight && y < 60_000; y += step) {
      window.scrollTo(0, y);
      await sleep(120);
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await sleep(600);
    window.scrollTo(0, 0);
    await sleep(800);
  });
}

/**
 * Runs inside the page. Rewrites same-origin images and CSS assets into
 * `h2h-asset:` placeholders (bytes are returned base64-encoded) and collects
 * the effective CSS. Must be self-contained: it is serialised by Playwright.
 */
async function capturePage() {
  const MAX_ASSETS = 80;
  const MAX_BYTES = 8 * 1024 * 1024;
  const origin = location.origin;
  const assets: { id: string; fileName: string; contentType: string; sourceUrl: string; base64: string }[] = [];
  const seen = new Map<string, string | null>();

  const abs = (u: string, base = location.href) => {
    try {
      return new URL(u, base).href;
    } catch {
      return null;
    }
  };
  const isSameOrigin = (u: string) => {
    try {
      return new URL(u).origin === origin;
    } catch {
      return false;
    }
  };

  async function grab(url: string): Promise<string | null> {
    if (seen.has(url)) return seen.get(url)!;
    seen.set(url, null);
    if (assets.length >= MAX_ASSETS) return null;
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (blob.size > MAX_BYTES) return null;
      const base64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
      const id = `a${assets.length + 1}`;
      const base = (new URL(url).pathname.split("/").pop() || "asset").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
      assets.push({ id, fileName: `${id}-${base}`, contentType: blob.type || "application/octet-stream", sourceUrl: url, base64 });
      seen.set(url, id);
      return id;
    } catch {
      return null;
    }
  }

  async function rewriteUrls(text: string, base: string): Promise<string> {
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
    let out = "";
    let last = 0;
    for (const m of text.matchAll(re)) {
      const raw = m[2].trim();
      let replacement = m[0];
      if (!raw.startsWith("data:") && !raw.startsWith("#")) {
        const full = abs(raw, base);
        if (full && isSameOrigin(full)) {
          const id = await grab(full);
          replacement = id ? `url(h2h-asset:${id})` : `url(${full})`;
        } else if (full) {
          replacement = `url(${full})`;
        }
      }
      out += text.slice(last, m.index) + replacement;
      last = (m.index ?? 0) + m[0].length;
    }
    return out + text.slice(last);
  }

  for (const img of Array.from(document.querySelectorAll("img"))) {
    const src = img.currentSrc || img.getAttribute("src") || "";
    if (!src || src.startsWith("data:")) continue;
    const full = abs(src);
    if (!full) continue;
    if (!img.hasAttribute("width") && img.naturalWidth) img.setAttribute("data-h2h-w", String(img.naturalWidth));
    if (!img.hasAttribute("height") && img.naturalHeight) img.setAttribute("data-h2h-h", String(img.naturalHeight));
    const id = isSameOrigin(full) ? await grab(full) : null;
    img.setAttribute("src", id ? `h2h-asset:${id}` : full);
    img.removeAttribute("srcset");
  }

  for (const el of Array.from(document.querySelectorAll<HTMLElement>("[style*='url(']"))) {
    el.setAttribute("style", await rewriteUrls(el.getAttribute("style") ?? "", location.href));
  }

  for (const a of Array.from(document.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href") ?? "";
    const full = abs(href);
    // Links to the Lovable host itself become root-relative, so they keep
    // working once the pages live on the HubSpot domain.
    if (full && isSameOrigin(full) && !href.startsWith("#")) {
      const u = new URL(full);
      u.searchParams.delete("__lovable_token");
      a.setAttribute("href", `${u.pathname}${u.search}${u.hash}`);
    }
  }

  const headLinks = new Set<string>();
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      if (sheet.href) headLinks.add(`<link rel="stylesheet" href="${sheet.href}">`);
      continue;
    }
    const parts: string[] = [];
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSImportRule) {
        const href = abs(rule.href, sheet.href ?? location.href);
        if (href) headLinks.add(`<link rel="stylesheet" href="${href}">`);
        continue;
      }
      parts.push(rule.cssText);
    }
    css += `${await rewriteUrls(parts.join("\n"), sheet.href ?? location.href)}\n`;
  }
  for (const link of Array.from(document.querySelectorAll("link[rel='preconnect']"))) {
    headLinks.add(link.outerHTML);
  }

  const bodyAttrs = Array.from(document.body.attributes)
    .filter((a) => a.name !== "style" || a.value.trim() !== "")
    .map((a) => `${a.name}="${a.value.replace(/"/g, "&quot;")}"`)
    .join(" ");

  return {
    title: document.title,
    html: document.documentElement.outerHTML,
    css,
    headLinks: [...headLinks],
    htmlLang: document.documentElement.lang || "en",
    bodyAttrs,
    assets,
  };
}
