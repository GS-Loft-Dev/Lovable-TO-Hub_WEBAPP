import type { ReactNode } from "react";

export type Lang = "it" | "en";

export interface Section {
  id: string;
  title: string;
  body: ReactNode;
}

function Callout({ kind = "tip", children }: { kind?: "tip" | "warn"; children: ReactNode }) {
  return <div className={`callout ${kind}`}>{children}</div>;
}

function Code({ children }: { children: string }) {
  return <pre className="code"><code>{children}</code></pre>;
}

function Flow({ steps }: { steps: { title: string; text: string }[] }) {
  return (
    <ol className="flow">
      {steps.map((s, i) => (
        <li key={s.title}>
          <b>{i + 1}</b>
          <strong>{s.title}</strong>
          <span>{s.text}</span>
        </li>
      ))}
    </ol>
  );
}

const ENV_EXAMPLE = `APP_URL=https://lovable2hubspot.tuodominio.it
SESSION_SECRET=<openssl rand -base64 32>
LOVABLE_API_KEY=<chiave di workspace>
HUBSPOT_ACCESS_TOKEN=<token della private app>`;

const ENV_EXAMPLE_EN = ENV_EXAMPLE.replace("tuodominio.it", "yourdomain.com")
  .replace("chiave di workspace", "workspace key")
  .replace("token della private app", "private app token");

const DOCKER = `cp .env.example .env   # compila i valori
docker compose up -d   # l'app risponde sulla porta 3000`;

const DOCKER_EN = `cp .env.example .env   # fill in the values
docker compose up -d   # the app listens on port 3000`;

const NETLIFY_ENV = `SESSION_SECRET=<openssl rand -base64 32>
LOVABLE_API_KEY=<chiave di workspace>      # oppure le variabili LOVABLE_* per l'OAuth
HUBSPOT_ACCESS_TOKEN=<token private app>   # oppure HUBSPOT_CLIENT_ID e HUBSPOT_CLIENT_SECRET`;

const NETLIFY_ENV_EN = `SESSION_SECRET=<openssl rand -base64 32>
LOVABLE_API_KEY=<workspace key>         # or the LOVABLE_* OAuth variables
HUBSPOT_ACCESS_TOKEN=<private app token>  # or HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET`;

/* ======================================================================== IT */

const it: Section[] = [
  {
    id: "panoramica",
    title: "Come funziona",
    body: (
      <>
        <p>
          L&apos;app prende una pagina fatta con Lovable e la trasforma in un <b>tema HubSpot</b> con moduli che il marketing può
          modificare dall&apos;editor di pagine. Niente repo GitHub, niente CLI: tre passaggi nel browser.
        </p>
        <Flow
          steps={[
            { title: "Sorgente", text: "Scegli il progetto dal tuo workspace Lovable oppure incolla l'URL pubblicato .lovable.app." },
            { title: "Revisione", text: "L'app divide la pagina in sezioni e ti mostra i moduli con i campi editabili. Rinomini o escludi." },
            { title: "Pubblicazione", text: "Accedi a HubSpot e premi Pubblica: immagini nel File Manager, tema nel Design Manager." },
          ]}
        />
        <Callout>
          Lovable non espone il codice sorgente via API, quindi l&apos;app lavora sulla <b>pagina renderizzata</b>: la apre in un browser
          invisibile, la scorre tutta (così partono animazioni e immagini lazy) e ne cattura HTML, CSS e immagini.
        </Callout>
      </>
    ),
  },
  {
    id: "configurazione",
    title: "Prima configurazione (una volta sola)",
    body: (
      <>
        <p>Questa parte la fa chi installa l&apos;app. Servono un indirizzo HTTPS, un segreto per le sessioni e almeno un accesso per lato.</p>

        <h3>1. Lovable: scegli come collegarti</h3>
        <ul>
          <li>
            <b>API key di workspace</b> (consigliata per un team): in Lovable vai su <i>Workspace settings → API keys &amp; OAuth</i>, crea una
            chiave con <code>projects:read</code> e <code>workspaces:read</code> e mettila in <code>LOVABLE_API_KEY</code>. Tutti gli
            utenti dell&apos;app vedranno i progetti di quel workspace.
          </li>
          <li>
            <b>OAuth</b> (ognuno con il proprio account): nella stessa schermata registra un <i>OAuth client</i> con redirect{" "}
            <code>{"{APP_URL}"}/api/auth/lovable/callback</code> e copia client ID, secret, URL di autorizzazione e URL del token nelle
            variabili <code>LOVABLE_*</code>.
          </li>
        </ul>
        <Callout kind="warn">
          Gli scope sui progetti richiedono un workspace <b>Business o Enterprise</b>. Senza, usa la scheda <i>Da un URL</i> con il sito
          pubblicato: funziona con qualsiasi piano.
        </Callout>

        <h3>2. HubSpot: scegli come collegarti</h3>
        <ul>
          <li>
            <b>Private app</b> (un solo portale): in HubSpot vai su <i>Impostazioni → Integrazioni → Private app</i> (nei portali più recenti si trova nell&apos;area <i>Sviluppo</i>), creane una con gli
            scope <code>content</code> e <code>files</code> e copia il token in <code>HUBSPOT_ACCESS_TOKEN</code>.
          </li>
          <li>
            <b>App pubblica OAuth</b> (più portali): crea un&apos;app nel tuo account sviluppatore HubSpot con redirect{" "}
            <code>{"{APP_URL}"}/api/auth/hubspot/callback</code>, gli stessi scope, e imposta <code>HUBSPOT_CLIENT_ID</code> e{" "}
            <code>HUBSPOT_CLIENT_SECRET</code>.
          </li>
        </ul>

        <h3>3. Avvia l&apos;app (Docker o server)</h3>
        <p>Per Netlify salta alla sezione successiva.</p>
        <p>Il minimo indispensabile nel file <code>.env</code>:</p>
        <Code>{ENV_EXAMPLE}</Code>
        <Code>{DOCKER}</Code>
        <Callout kind="warn">
          <code>APP_URL</code> deve essere <b>https://</b>: Lovable carica le preview solo dentro un iframe su un dominio HTTPS. In locale
          (http://localhost) funziona solo la conversione da URL.
        </Callout>
      </>
    ),
  },
  {
    id: "netlify",
    title: "Mettere l'app online su Netlify",
    body: (
      <>
        <p>L&apos;app è già pronta per Netlify: il file <code>netlify.toml</code> nel repo imposta la build, il browser e lo storage si adattano da soli.</p>
        <ol className="numbered">
          <li>Carica il repo sul tuo GitHub.</li>
          <li>
            Su Netlify: <i>Add new project → Import an existing project</i>, scegli GitHub e il repo. Le impostazioni di build vengono lette
            da <code>netlify.toml</code>: non toccare nulla.
          </li>
          <li>
            Prima del deploy, in <i>Environment variables</i> aggiungi le variabili qui sotto. Lasciale disponibili anche alle{" "}
            <b>Functions</b>, che è l&apos;impostazione predefinita.
          </li>
          <li>Avvia il deploy. Al termine apri l&apos;indirizzo <code>https://nome-sito.netlify.app</code> e prova una conversione.</li>
        </ol>
        <Code>{NETLIFY_ENV}</Code>
        <ul>
          <li><code>APP_URL</code> non serve: l&apos;app usa l&apos;indirizzo principale del sito, compreso un dominio personalizzato.</li>
          <li>Se usi l&apos;OAuth di HubSpot, il redirect da registrare è <code>https://nome-sito.netlify.app/api/auth/hubspot/callback</code>.</li>
          <li>Le conversioni sono salvate in <b>Netlify Blobs</b>, senza configurazione.</li>
        </ul>
        <Callout kind="warn">
          Su Netlify ogni richiesta può durare al massimo <b>60 secondi</b>. Per questo l&apos;app converte fino a <b>3 pagine</b> alla volta
          (<code>MAX_ROUTES</code>). La prima conversione dopo un periodo di inattività è più lenta, perché scarica Chromium (circa 60 MB).
        </Callout>
        <Callout>
          Se le pagine sono pesanti o vanno in timeout, collega un browser remoto: crea un account su un servizio come Browserless e imposta{" "}
          <code>BROWSER_WS_ENDPOINT</code> con l&apos;indirizzo <code>wss://…?token=…</code> che ti fornisce. Il rendering diventa più veloce e
          la funzione non deve avviare Chromium.
        </Callout>
      </>
    ),
  },
  {
    id: "convertire",
    title: "Convertire una pagina",
    body: (
      <>
        <ol className="numbered">
          <li>
            Nella scheda <b>Da Lovable</b> premi <i>Log in with Lovable</i> (o trovi già il workspace collegato), cerca il progetto e
            selezionalo. In alternativa, nella scheda <b>Da un URL</b> incolla l&apos;indirizzo pubblicato, per esempio{" "}
            <code>https://promo-autunno.lovable.app</code>.
          </li>
          <li>
            In <b>Pages</b> indica le pagine da convertire, separate da virgola: <code>/, /chi-siamo, /prezzi</code>. Header e footer uguali
            su più pagine diventano un unico modulo condiviso.
          </li>
          <li>
            In <b>Theme name</b> scrivi il nome della cartella che comparirà nel Design Manager. Usa un nome per campagna o landing, per
            esempio <code>promo-autunno-2026</code>.
          </li>
          <li>Premi <b>Convert</b>. Ci vogliono da 10 secondi a un minuto, a seconda della pagina.</li>
        </ol>
        <Callout>
          La preview di Lovable mostra <b>l&apos;ultima build</b> del progetto, anche se non l&apos;hai ancora pubblicata. Se vuoi convertire
          esattamente quello che è online, usa l&apos;URL pubblicato.
        </Callout>
      </>
    ),
  },
  {
    id: "revisione",
    title: "Rivedere i moduli",
    body: (
      <>
        <p>Ogni sezione della pagina diventa un modulo. Per ciascuno vedi un&apos;anteprima, il tipo e i campi che il marketing potrà modificare.</p>
        <table className="table">
          <thead>
            <tr><th>Nella pagina Lovable</th><th>Su HubSpot diventa</th></tr>
          </thead>
          <tbody>
            <tr><td>Navbar in alto</td><td>Modulo fisso <i>Site Header</i>, uguale su tutte le pagine del template</td></tr>
            <tr><td>Ogni <code>&lt;section&gt;</code></td><td>Modulo drag-and-drop: si può spostare, duplicare o togliere</td></tr>
            <tr><td>Footer</td><td>Modulo fisso <i>Site Footer</i></td></tr>
            <tr><td>Titoli e paragrafi</td><td>Campo <b>text</b>, oppure <b>richtext</b> se contengono grassetti o a capo</td></tr>
            <tr><td>Immagini</td><td>Campo <b>image</b>: si sostituisce dal File Manager</td></tr>
            <tr><td>Bottoni e link</td><td>Campo <b>link</b> (URL, nuova scheda) + testo del bottone</td></tr>
            <tr><td>Card, feature, recensioni ripetute</td><td><b>Repeater</b>: si aggiungono e tolgono elementi</td></tr>
          </tbody>
        </table>
        <p>Cosa puoi fare qui:</p>
        <ul>
          <li><b>Rinominare</b> un modulo: il nome a sinistra è quello che vede chi crea la pagina, quello a destra è la cartella tecnica.</li>
          <li><b>Escludere</b> un modulo con <i>Include</i>, per esempio un banner cookie o una sezione di test.</li>
          <li>Controllare gli <b>avvisi</b>: un modulo senza campi editabili verrà copiato statico.</li>
        </ul>
      </>
    ),
  },
  {
    id: "pubblicare",
    title: "Pubblicare e creare la pagina su HubSpot",
    body: (
      <>
        <ol className="numbered">
          <li>Premi <b>Log in with HubSpot</b> e scegli il portale (con la private app sei già collegato).</li>
          <li>
            Premi <b>Publish theme</b>. Nel log vedi ogni file caricato: ✓ caricato, ✗ errore di validazione HubSpot con il numero di riga.
            Ripubblicare con lo stesso nome tema <b>sovrascrive</b> la versione precedente.
          </li>
          <li>
            In HubSpot vai su <i>Contenuti → Landing page</i> (o <i>Pagine del sito web</i>) → <i>Crea</i>, scegli il tema appena caricato e il
            template della pagina.
          </li>
          <li>
            Nell&apos;editor clicca su un modulo per cambiare testi, immagini e link. Dal pannello laterale puoi aggiungere sezioni, spostarle o
            aggiungere elementi ai repeater.
          </li>
          <li>Imposta titolo SEO, meta description e URL nelle impostazioni della pagina, poi pubblica.</li>
        </ol>
        <Callout>
          Preferisci caricare a mano? Con <b>Download .zip</b> ottieni il tema pronto per <code>npx @hubspot/cli upload</code>. In quel caso
          le immagini restano puntate agli URL originali di Lovable.
        </Callout>
      </>
    ),
  },
  {
    id: "consigli",
    title: "Preparare la pagina su Lovable per una conversione migliore",
    body: (
      <>
        <p>L&apos;app funziona con qualsiasi pagina, ma con qualche accortezza ottieni più campi editabili e moduli più puliti. Puoi chiederlo direttamente a Lovable in chat:</p>
        <ul>
          <li>Usa una <code>&lt;section&gt;</code> per ogni blocco della pagina, dentro un <code>&lt;main&gt;</code>, con <code>&lt;nav&gt;</code> e <code>&lt;footer&gt;</code> fuori.</li>
          <li>Dai un <code>id</code> parlante alle sezioni (<code>id=&quot;prezzi&quot;</code>): diventa il nome del modulo.</li>
          <li>Card e elenchi ripetuti con <b>la stessa struttura</b>: se una card ha un elemento in più, non diventano un repeater.</li>
          <li>Evita testi visibili solo dopo un clic (tab, accordion chiusi): vengono catturati come appaiono al caricamento.</li>
          <li>I form collegati a Supabase arrivano come solo HTML: sostituiscili con un modulo form di HubSpot.</li>
        </ul>
        <Code>{`Prompt per Lovable:
"Struttura la pagina con <nav>, un <main> che contiene una <section id='...'> per ogni blocco,
e un <footer>. Fai in modo che tutte le card dello stesso elenco abbiano esattamente la stessa struttura."`}</Code>
      </>
    ),
  },
  {
    id: "problemi",
    title: "Problemi comuni",
    body: (
      <dl className="faq">
        <dt>«Lovable previews only load on an HTTPS origin»</dt>
        <dd>L&apos;app gira su http. Imposta <code>APP_URL</code> all&apos;indirizzo https pubblico, oppure usa la scheda <i>Da un URL</i>.</dd>
        <dt>Errore 403 da Lovable</dt>
        <dd>La chiave o il client OAuth non ha <code>projects:read</code>, oppure il workspace non è Business/Enterprise.</dd>
        <dt>Errore 403 da HubSpot, «missing scope»</dt>
        <dd>All&apos;app HubSpot mancano gli scope <code>content</code> o <code>files</code>. Aggiungili e rifai il login (o rigenera il token).</dd>
        <dt>«This server only converts Lovable sites»</dt>
        <dd>Per sicurezza l&apos;app apre solo domini Lovable. Per un dominio personalizzato, l&apos;admin lo aggiunge a <code>RENDER_ALLOWED_HOSTS</code>.</dd>
        <dt>Su Netlify la conversione va in errore o in timeout</dt>
        <dd>Converti meno pagine alla volta, oppure imposta <code>BROWSER_WS_ENDPOINT</code> con un browser remoto. Riprova: il primo tentativo dopo l&apos;inattività scarica Chromium ed è più lento.</dd>
        <dt>Una sezione è vuota o invisibile nell&apos;anteprima</dt>
        <dd>Probabilmente compare solo dopo un&apos;interazione. Rendila visibile al caricamento su Lovable e riconverti.</dd>
        <dt>Un file è segnato ✗ in pubblicazione</dt>
        <dd>Il resto del tema è caricato. Leggi il messaggio di HubSpot: di solito basta escludere quel modulo e ripubblicare. Se pensi sia un bug, apri una issue su GitHub con l&apos;errore.</dd>
        <dt>Le immagini non si vedono nel tema scaricato in zip</dt>
        <dd>Nello zip i campi immagine puntano agli URL originali. Se il progetto Lovable non è pubblico, usa <i>Publish theme</i>, che le carica nel File Manager.</dd>
      </dl>
    ),
  },
];

/* ======================================================================== EN */

const en: Section[] = [
  {
    id: "overview",
    title: "How it works",
    body: (
      <>
        <p>
          The app takes a page built with Lovable and turns it into a <b>HubSpot theme</b> whose modules marketers can edit in the page
          editor. No GitHub repo, no CLI: three steps in the browser.
        </p>
        <Flow
          steps={[
            { title: "Source", text: "Pick a project from your Lovable workspace, or paste the published .lovable.app URL." },
            { title: "Review", text: "The app splits the page into sections and shows the modules with their editable fields. Rename or exclude." },
            { title: "Publish", text: "Log in to HubSpot and hit Publish: images to the File Manager, theme to the Design Manager." },
          ]}
        />
        <Callout>
          Lovable doesn&apos;t expose source code through its API, so the app works on the <b>rendered page</b>: it opens it in a headless
          browser, scrolls through it (so animations and lazy images run) and captures HTML, CSS and images.
        </Callout>
      </>
    ),
  },
  {
    id: "setup",
    title: "First-time setup",
    body: (
      <>
        <p>Whoever installs the app does this once. You need an HTTPS address, a session secret and at least one login per side.</p>

        <h3>1. Lovable: pick how to connect</h3>
        <ul>
          <li>
            <b>Workspace API key</b> (recommended for a team): in Lovable open <i>Workspace settings → API keys &amp; OAuth</i>, create a
            key with <code>projects:read</code> and <code>workspaces:read</code> and set <code>LOVABLE_API_KEY</code>. Everyone using
            the app sees that workspace&apos;s projects.
          </li>
          <li>
            <b>OAuth</b> (everyone with their own account): on the same screen register an <i>OAuth client</i> with redirect{" "}
            <code>{"{APP_URL}"}/api/auth/lovable/callback</code> and copy client ID, secret, authorize URL and token URL into the{" "}
            <code>LOVABLE_*</code> variables.
          </li>
        </ul>
        <Callout kind="warn">
          Project scopes need a <b>Business or Enterprise</b> workspace. Without one, use the <i>From a URL</i> tab with the published site:
          it works on every plan.
        </Callout>

        <h3>2. HubSpot: pick how to connect</h3>
        <ul>
          <li>
            <b>Private app</b> (one portal): in HubSpot go to <i>Settings → Integrations → Private apps</i> (newer portals list it under <i>Development</i>), create one with the{" "}
            <code>content</code> and <code>files</code> scopes and copy the token into <code>HUBSPOT_ACCESS_TOKEN</code>.
          </li>
          <li>
            <b>Public OAuth app</b> (many portals): create an app in your HubSpot developer account with redirect{" "}
            <code>{"{APP_URL}"}/api/auth/hubspot/callback</code>, the same scopes, and set <code>HUBSPOT_CLIENT_ID</code> and{" "}
            <code>HUBSPOT_CLIENT_SECRET</code>.
          </li>
        </ul>

        <h3>3. Start the app (Docker or a server)</h3>
        <p>For Netlify, skip to the next section.</p>
        <p>The bare minimum in <code>.env</code>:</p>
        <Code>{ENV_EXAMPLE_EN}</Code>
        <Code>{DOCKER_EN}</Code>
        <Callout kind="warn">
          <code>APP_URL</code> must be <b>https://</b>: Lovable only loads previews inside an iframe on an HTTPS origin. Locally
          (http://localhost) only URL conversion works.
        </Callout>
      </>
    ),
  },
  {
    id: "netlify",
    title: "Hosting the app on Netlify",
    body: (
      <>
        <p>The app is ready for Netlify: <code>netlify.toml</code> in the repo sets up the build, and the browser and storage adapt on their own.</p>
        <ol className="numbered">
          <li>Push the repo to your GitHub.</li>
          <li>
            On Netlify: <i>Add new project → Import an existing project</i>, pick GitHub and the repo. Build settings come from{" "}
            <code>netlify.toml</code>: leave them as they are.
          </li>
          <li>
            Before deploying, add the variables below under <i>Environment variables</i>. Keep them available to <b>Functions</b>, which is
            the default.
          </li>
          <li>Deploy. Then open <code>https://your-site.netlify.app</code> and try a conversion.</li>
        </ol>
        <Code>{NETLIFY_ENV_EN}</Code>
        <ul>
          <li><code>APP_URL</code> isn&apos;t needed: the app uses the site&apos;s primary URL, custom domain included.</li>
          <li>With HubSpot OAuth, register the redirect <code>https://your-site.netlify.app/api/auth/hubspot/callback</code>.</li>
          <li>Conversions are stored in <b>Netlify Blobs</b>, no setup needed.</li>
        </ul>
        <Callout kind="warn">
          On Netlify each request can run for at most <b>60 seconds</b>, so the app converts up to <b>3 pages</b> at a time
          (<code>MAX_ROUTES</code>). The first conversion after a quiet period is slower, because it downloads Chromium (about 60 MB).
        </Callout>
        <Callout>
          If pages are heavy or time out, connect a remote browser: sign up for a service such as Browserless and set{" "}
          <code>BROWSER_WS_ENDPOINT</code> to the <code>wss://…?token=…</code> address it gives you. Rendering gets faster and the function
          no longer has to start Chromium.
        </Callout>
      </>
    ),
  },
  {
    id: "convert",
    title: "Converting a page",
    body: (
      <>
        <ol className="numbered">
          <li>
            In the <b>From Lovable</b> tab click <i>Log in with Lovable</i> (or the workspace is already connected), search for the project
            and select it. Or, in the <b>From a URL</b> tab, paste the published address, e.g. <code>https://fall-promo.lovable.app</code>.
          </li>
          <li>
            In <b>Pages</b> list the routes to convert, comma separated: <code>/, /about, /pricing</code>. A header and footer shared by
            several pages become one shared module.
          </li>
          <li>
            In <b>Theme name</b> type the folder name you&apos;ll see in the Design Manager. Use one per campaign or landing, e.g.{" "}
            <code>fall-promo-2026</code>.
          </li>
          <li>Click <b>Convert</b>. It takes 10 seconds to a minute depending on the page.</li>
        </ol>
        <Callout>
          The Lovable preview shows the project&apos;s <b>latest build</b>, even if you haven&apos;t published it yet. To convert exactly
          what&apos;s live, use the published URL.
        </Callout>
      </>
    ),
  },
  {
    id: "review",
    title: "Reviewing the modules",
    body: (
      <>
        <p>Every section of the page becomes a module. For each one you see a preview, its kind and the fields marketers will be able to edit.</p>
        <table className="table">
          <thead>
            <tr><th>On the Lovable page</th><th>In HubSpot it becomes</th></tr>
          </thead>
          <tbody>
            <tr><td>Top navbar</td><td>Fixed <i>Site Header</i> module, the same on every page of the template</td></tr>
            <tr><td>Each <code>&lt;section&gt;</code></td><td>Drag-and-drop module: can be moved, cloned or removed</td></tr>
            <tr><td>Footer</td><td>Fixed <i>Site Footer</i> module</td></tr>
            <tr><td>Headings and paragraphs</td><td><b>text</b> field, or <b>richtext</b> when they contain bold text or line breaks</td></tr>
            <tr><td>Images</td><td><b>image</b> field: swap it from the File Manager</td></tr>
            <tr><td>Buttons and links</td><td><b>link</b> field (URL, new tab) + the button label</td></tr>
            <tr><td>Repeated cards, features, reviews</td><td><b>Repeater</b>: items can be added and removed</td></tr>
          </tbody>
        </table>
        <p>What you can do here:</p>
        <ul>
          <li><b>Rename</b> a module: the left name is what page creators see, the right one is the technical folder.</li>
          <li><b>Exclude</b> a module with <i>Include</i>, e.g. a cookie banner or a test section.</li>
          <li>Check the <b>warnings</b>: a module without editable fields is copied as static markup.</li>
        </ul>
      </>
    ),
  },
  {
    id: "publish",
    title: "Publishing and creating the page in HubSpot",
    body: (
      <>
        <ol className="numbered">
          <li>Click <b>Log in with HubSpot</b> and pick the portal (with a private app you&apos;re already connected).</li>
          <li>
            Click <b>Publish theme</b>. The log lists every file: ✓ uploaded, ✗ HubSpot validation error with the line number. Publishing
            again with the same theme name <b>overwrites</b> the previous version.
          </li>
          <li>In HubSpot go to <i>Content → Landing pages</i> (or <i>Website pages</i>) → <i>Create</i>, pick the theme you just uploaded and the page template.</li>
          <li>In the editor click a module to change texts, images and links. From the side panel you can add sections, move them or add repeater items.</li>
          <li>Set the SEO title, meta description and URL in the page settings, then publish.</li>
        </ol>
        <Callout>
          Rather upload by hand? <b>Download .zip</b> gives you the theme ready for <code>npx @hubspot/cli upload</code>. In that case images
          keep pointing at the original Lovable URLs.
        </Callout>
      </>
    ),
  },
  {
    id: "tips",
    title: "Preparing the Lovable page for a better conversion",
    body: (
      <>
        <p>Any page converts, but a few habits give you more editable fields and cleaner modules. You can ask Lovable for them in chat:</p>
        <ul>
          <li>One <code>&lt;section&gt;</code> per block, inside a <code>&lt;main&gt;</code>, with <code>&lt;nav&gt;</code> and <code>&lt;footer&gt;</code> outside.</li>
          <li>Give sections a meaningful <code>id</code> (<code>id=&quot;pricing&quot;</code>): it becomes the module name.</li>
          <li>Repeated cards and lists with <b>the same structure</b>: if one card has an extra element, they won&apos;t become a repeater.</li>
          <li>Avoid content only visible after a click (tabs, closed accordions): it&apos;s captured as it looks on load.</li>
          <li>Forms wired to Supabase arrive as plain HTML: replace them with a HubSpot form module.</li>
        </ul>
        <Code>{`Prompt for Lovable:
"Structure the page with a <nav>, a <main> containing one <section id='...'> per block,
and a <footer>. Make every card in the same list share exactly the same structure."`}</Code>
      </>
    ),
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    body: (
      <dl className="faq">
        <dt>“Lovable previews only load on an HTTPS origin”</dt>
        <dd>The app runs on http. Set <code>APP_URL</code> to the public https address, or use the <i>From a URL</i> tab.</dd>
        <dt>403 from Lovable</dt>
        <dd>The key or OAuth client lacks <code>projects:read</code>, or the workspace isn&apos;t on Business/Enterprise.</dd>
        <dt>403 from HubSpot, “missing scope”</dt>
        <dd>The HubSpot app is missing <code>content</code> or <code>files</code>. Add them and log in again (or regenerate the token).</dd>
        <dt>“This server only converts Lovable sites”</dt>
        <dd>For safety the app only opens Lovable domains. For a custom domain, the admin adds it to <code>RENDER_ALLOWED_HOSTS</code>.</dd>
        <dt>On Netlify the conversion fails or times out</dt>
        <dd>Convert fewer pages at once, or set <code>BROWSER_WS_ENDPOINT</code> to a remote browser. Try again: the first run after a quiet period downloads Chromium and is slower.</dd>
        <dt>A section is empty or invisible in the preview</dt>
        <dd>It probably only appears after an interaction. Make it visible on load in Lovable and convert again.</dd>
        <dt>A file is marked ✗ when publishing</dt>
        <dd>The rest of the theme is uploaded. Read HubSpot&apos;s message: usually excluding that module and publishing again is enough. If it looks like a bug, open a GitHub issue with the error.</dd>
        <dt>Images don&apos;t show in the zip theme</dt>
        <dd>In the zip, image fields point at the original URLs. If the Lovable project isn&apos;t public, use <i>Publish theme</i>, which uploads them to the File Manager.</dd>
      </dl>
    ),
  },
];

export const sections: Record<Lang, Section[]> = { it, en };

export const ui: Record<Lang, { title: string; intro: string; back: string; toc: string; open: string }> = {
  it: {
    title: "Tutorial",
    intro: "Dalla prima configurazione alla pagina pubblicata su HubSpot, passo per passo.",
    back: "← Torna all'app",
    toc: "In questa guida",
    open: "Apri l'app",
  },
  en: {
    title: "Tutorial",
    intro: "From first-time setup to a live HubSpot page, step by step.",
    back: "← Back to the app",
    toc: "In this guide",
    open: "Open the app",
  },
};
