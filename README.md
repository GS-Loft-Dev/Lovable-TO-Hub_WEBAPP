# Lovable → HubSpot

**Turn a Lovable project into an editable HubSpot CMS theme, and publish it, from one web app.**

Log in with Lovable, pick a project, review the modules, log in with HubSpot, publish. No GitHub repo, no CLI, no copy-pasting HTML into the Design Manager.

The result is a real HubSpot theme rather than a frozen HTML dump. Every section becomes a drag-and-drop module whose texts, images and links your marketing team can edit in the HubSpot page editor. Lists of cards, features or testimonials become repeaters, so editors can add and remove items.

> Self-hostable, MIT licensed. Not affiliated with Lovable or HubSpot.

---

## How it works

```
Lovable project ──► headless Chrome ──► section detection ──► HubSpot modules ──► Design Manager
 (login or URL)     renders the page     header / sections /    fields + repeaters    + File Manager
                    captures CSS+images  footer                 + HubL templates      (via API)
```

1. **Source.** The Lovable API doesn't expose source code, so the app works on the **rendered page**:
   - *Log in with Lovable* (OAuth, or a workspace API key set by the admin). The app lists your projects and asks Lovable for a short-lived [embed URL](https://docs.lovable.dev/integrations/lovable-api) of the latest preview build.
   - Or *paste the URL* of any published `*.lovable.app` site. This works on every Lovable plan.
2. **Render.** Headless Chrome opens the page and scrolls it so scroll-triggered animations and lazy images run. It then captures the final DOM, the effective CSS (Tailwind included) and the same-origin images and fonts.
3. **Convert.** The converter strips Lovable runtime artefacts and finds the page structure:
   - a navbar becomes a fixed header module;
   - each section inside `<main>` becomes a drag-and-drop module;
   - the footer becomes a fixed footer module.

   Inside each module:

   | Source | HubSpot field |
   |---|---|
   | `h1`–`h6`, `p`, `span`, `li`, `button`… with plain text | `text` |
   | the same with inline markup (`<strong>`, `<em>`, `<br>`…) | `richtext` |
   | `<img>` | `image` (src, alt, size, lazy loading) |
   | `<a href>` | `link` (URL, new tab, email) + `text` for its label |
   | 2+ siblings with identical structure | `group` repeater rendered with a HubL `for` loop |

   Header and footer shared across pages are deduplicated into one module.
4. **Review.** Each module shows a live preview. You can rename it, change its folder name or exclude it before publishing.
5. **Publish.** Images and fonts are uploaded to your HubSpot **File Manager**. The theme files are validated, then written to the **Design Manager** with the [CMS Source Code API](https://developers.hubspot.com/docs/api-reference/latest/cms/source-code/guide). Validation errors are reported per file. You can also download the theme as a `.zip` and upload it with `hs upload`.

The generated theme:

```
my-landing/
├── theme.json
├── fields.json
├── css/main.css                  # captured CSS, wrapped in {% raw %}
├── templates/
│   ├── layouts/base.html         # <head>, fonts, standard includes
│   └── home.html                 # header + dnd_area with sections + footer
└── modules/
    ├── site-header.module/       # module.html, fields.json, meta.json
    ├── hero.module/
    ├── features.module/          # with a repeater group
    └── site-footer.module/
```

## Quick start

### Docker

```bash
cp .env.example .env    # fill in APP_URL, SESSION_SECRET and at least one login option
docker compose up -d
```

### Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/YOUR_USERNAME/lovable-to-hubspot)

Import the repo in Netlify; `netlify.toml` configures the build. Add `SESSION_SECRET` and your Lovable/HubSpot login variables to the site's environment variables, then deploy. On Netlify the app:

- takes `APP_URL` from the site's primary URL;
- stores conversions in **Netlify Blobs**;
- runs a Lambda-compatible Chromium ([`@sparticuz/chromium-min`](https://github.com/Sparticuz/chromium)), downloaded to `/tmp` on cold start. Set `BROWSER_WS_ENDPOINT` to use a remote browser such as Browserless instead.

Functions stop at 60 seconds, so a conversion handles up to 3 pages (`MAX_ROUTES`).

### Local

Requires Node 20+ and Chrome or Chromium installed (or `CHROME_PATH`).

```bash
npm install
cp .env.example .env.local
npm run dev
```

Without any login configured you can still convert a pasted `*.lovable.app` URL and download the zip.

A step-by-step guide (Italian and English) is built into the app at **`/tutorial`**: setup, converting, reviewing, creating the page in HubSpot, tips for Lovable prompts and troubleshooting.

## Configuration

All settings are environment variables; see [`.env.example`](.env.example).

| Variable | Required | What it does |
|---|---|---|
| `APP_URL` | yes | Public URL of the app. Must be `https://` for Lovable login, because embed URLs only load in an iframe on an HTTPS origin. |
| `SESSION_SECRET` | yes | 32+ random characters (`openssl rand -base64 32`). |
| `RENDER_ALLOWED_HOSTS` | | Hosts the server may open. Default `*.lovable.app,*.lovableproject.com,*.lovable.dev`. |
| `DATA_DIR` | | Where conversions are stored (deleted after 7 days). |
| `CHROME_PATH` | | Chrome/Chromium binary; auto-detected otherwise. |
| `BROWSER_WS_ENDPOINT` | | Remote browser over CDP (Browserless, Steel…). Takes priority over local Chromium. |
| `CHROMIUM_PACK_URL` | | Lambda Chromium pack used on serverless hosts; defaults to the v153.0.0 x64 release. |
| `STORAGE` | | `fs` or `netlify`; auto-detected. |
| `RENDER_TIMEOUT_MS`, `MAX_ROUTES` | | Per-page timeout and pages per conversion (defaults 45000 and 10, or 3 on serverless). |

### Lovable login

Pick one:

- **OAuth (multi-user).** In Lovable, open *Workspace settings → API keys & OAuth → OAuth clients* and register a client with redirect URL `{APP_URL}/api/auth/lovable/callback` and the scopes `projects:read` and `workspaces:read`. Copy the client ID and secret, plus the authorize and token URLs Lovable shows, into `LOVABLE_CLIENT_ID`, `LOVABLE_CLIENT_SECRET`, `LOVABLE_AUTHORIZE_URL` and `LOVABLE_TOKEN_URL`. Project scopes count as sensitive and need a Business or Enterprise workspace.
- **Workspace API key (single team).** Create a key with `projects:read` and `workspaces:read` and set `LOVABLE_API_KEY`. Everyone using the instance sees that workspace's projects, so use this only on an internal instance.

### HubSpot login

Pick one:

- **OAuth (multi-portal).** Create a public app in a HubSpot developer account with redirect URL `{APP_URL}/api/auth/hubspot/callback` and the scopes `content` and `files`. Set `HUBSPOT_CLIENT_ID` and `HUBSPOT_CLIENT_SECRET`.
- **Private app token (single portal).** Create a private app with `content` and `files` and set `HUBSPOT_ACCESS_TOKEN`.

## Limitations

- **Interactivity becomes static.** React state, accordions, carousels and tabs are captured as they look on load. Rebuild them with HubSpot modules or add your own JS to the theme.
- **Forms.** Forms wired to Supabase or other backends are copied as markup only. Swap them for a HubSpot form module.
- **One viewport.** The page is captured at 1440px wide. Responsive behaviour comes from the captured CSS (Tailwind breakpoints work), not from a re-render at each size.
- **Heuristics.** Section and repeater detection is tuned for typical Lovable markup (`#root > div > nav + main > section… + footer`). Unusual layouts still convert, with fewer editable fields. Please open an issue with the page so the converter can learn it.

## Security notes

- The server opens URLs in a real browser. Keep `RENDER_ALLOWED_HOSTS` restricted on any instance reachable from the internet.
- Tokens are kept in an encrypted, HTTP-only session cookie and never written to disk.
- Conversions belong to the browser session that created them.
- Captured markup is previewed with scripts disabled by CSP.

## Development

```bash
npm test          # converter, renderer (needs Chrome) and publish tests
npm run typecheck
npm run build
```

The code is organised as:

- `src/lib/converter/`: pure HTML → theme model → HubSpot files. Start here to improve detection.
- `src/lib/render.ts`: headless Chrome capture (local, serverless or remote browser).
- `src/lib/storage.ts`: job storage on disk or in Netlify Blobs.
- `src/lib/integrations/`: Lovable and HubSpot API clients.
- `src/app/`: the Next.js web app and its API routes.

## Roadmap

- [ ] Create the landing page in HubSpot (draft) right after publishing
- [ ] Map forms to HubSpot forms
- [ ] Re-sync: update an existing theme while keeping editor content
- [ ] Capture mobile and tablet layouts too
- [ ] Other AI builders (Bolt, v0) through the URL source
- [x] Built-in tutorial in Italian and English
- [ ] Full UI translations (Italian first)

## Contributing

Issues and PRs are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
