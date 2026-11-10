"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* ------------------------------------------------------------------ types */

interface Setup {
  setup: { lovableOAuth: boolean; lovableApiKey: boolean; hubspotOAuth: boolean; hubspotToken: boolean; embedAvailable: boolean };
  lovable: { connected: boolean; viaKey: boolean };
  hubspot: { portalId: number; hubDomain?: string; viaToken: boolean } | null;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  isPublished: boolean;
  screenshotUrl: string | null;
  lastEditedAt: string | null;
}

interface FieldSummary { name: string; label: string; type: string; children?: { name: string; type: string }[]; items?: number }
interface ModuleSummary { id: string; name: string; label: string; kind: "header" | "footer" | "section"; included: boolean; fields: FieldSummary[] }
interface JobSummary {
  id: string;
  source: { kind: string; label: string };
  theme: { name: string; label: string };
  warnings: string[];
  assets: number;
  pages: { route: string; label: string; templateName: string }[];
  modules: ModuleSummary[];
}

interface PublishResult {
  ok: boolean;
  portalId: number;
  themePath: string;
  designManagerUrl: string;
  steps: { path: string; status: "uploaded" | "failed" | "skipped"; error?: string }[];
}

/* ------------------------------------------------------------------ helpers */

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

function Spinner() {
  return <span className="spinner" aria-hidden />;
}

/* ------------------------------------------------------------------ page */

export default function Home() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [job, setJob] = useState<JobSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshSetup = useCallback(() => api<Setup>("/api/setup").then(setSetup).catch((e) => setError(e.message)), []);

  useEffect(() => {
    refreshSetup();
    const params = new URLSearchParams(location.search);
    const auth = params.get("auth");
    if (auth?.endsWith(":denied")) setError("Login was cancelled.");
    const jobId = params.get("job");
    if (jobId) api<JobSummary>(`/api/jobs/${jobId}`).then(setJob).catch(() => undefined);
    if (auth) {
      params.delete("auth");
      history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
    }
  }, [refreshSetup]);

  const openJob = (j: JobSummary | null) => {
    setJob(j);
    const params = new URLSearchParams(location.search);
    if (j) params.set("job", j.id);
    else params.delete("job");
    history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
  };

  const step = !job ? 1 : 2;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="l">Lovable</span>
          <span className="arrow">→</span>
          <span className="h">HubSpot</span>
        </div>
        <a className="btn ghost" href="/tutorial">Tutorial</a>
      </header>
      <p className="tagline">Turn a Lovable project into an editable HubSpot theme, without the GitHub detour.</p>

      <nav className="steps" aria-label="Progress">
        <span className={`step ${step === 1 ? "active" : "done"}`}><b>1</b> Source</span>
        <span className={`step ${step === 2 ? "active" : ""}`}><b>2</b> Review modules</span>
        <span className={`step ${step === 2 ? "active" : ""}`}><b>3</b> Publish</span>
      </nav>

      {error && (
        <div className="notice error" role="alert">
          {error} <button className="btn ghost" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {!setup ? (
        <div className="card row"><Spinner /> Loading…</div>
      ) : !job ? (
        <SourceStep setup={setup} onDone={openJob} onError={setError} onRefresh={refreshSetup} />
      ) : (
        <>
          <ReviewStep job={job} onChange={setJob} onReset={() => openJob(null)} onError={setError} />
          <PublishStep job={job} setup={setup} onError={setError} onRefresh={refreshSetup} />
        </>
      )}

      <footer className="foot">
        Open source, MIT licensed. Not affiliated with Lovable or HubSpot.
      </footer>
    </main>
  );
}

/* ------------------------------------------------------------------ step 1 */

function SourceStep({ setup, onDone, onError, onRefresh }: {
  setup: Setup;
  onDone: (j: JobSummary) => void;
  onError: (e: string | null) => void;
  onRefresh: () => void;
}) {
  const lovableReady = setup.lovable.connected || setup.lovable.viaKey;
  const lovableAvailable = setup.setup.lovableOAuth || setup.setup.lovableApiKey;
  const [mode, setMode] = useState<"lovable" | "url">(lovableAvailable ? "lovable" : "url");
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [query, setQuery] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [url, setUrl] = useState("");
  const [routes, setRoutes] = useState("/");
  const [themeName, setThemeName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "lovable" || !lovableReady) return;
    const t = setTimeout(() => {
      api<{ projects: Project[] }>(`/api/lovable/projects${query.length >= 3 ? `?q=${encodeURIComponent(query)}` : ""}`)
        .then((r) => setProjects(r.projects))
        .catch((e) => onError(e.message));
    }, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [mode, lovableReady, query, onError]);

  const canConvert = mode === "url" ? url.trim().length > 4 : Boolean(project);

  const convert = async () => {
    onError(null);
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          source: mode,
          url: mode === "url" ? url : undefined,
          projectId: project?.id,
          projectName: project?.name,
          routes: routes.split(/[,\s]+/).filter(Boolean),
          themeName: themeName || project?.name || undefined,
        }),
      });
      onDone(await api<JobSummary>(`/api/jobs/${id}`));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Where is the site?</h2>
      <p className="sub">Pick a project from your Lovable workspace, or paste the URL of a published Lovable site.</p>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === "lovable"} className={mode === "lovable" ? "on" : ""} onClick={() => setMode("lovable")}>From Lovable</button>
        <button role="tab" aria-selected={mode === "url"} className={mode === "url" ? "on" : ""} onClick={() => setMode("url")}>From a URL</button>
      </div>

      {mode === "lovable" && (
        <div>
          {!lovableAvailable ? (
            <div className="notice">
              Lovable login isn&apos;t configured on this server. The admin can set <code>LOVABLE_CLIENT_ID</code> (OAuth) or <code>LOVABLE_API_KEY</code>; meanwhile, use a URL. <a href="/tutorial#setup">How to set it up</a>
            </div>
          ) : !lovableReady ? (
            <a className="btn lovable" href="/api/auth/lovable/login">Log in with Lovable</a>
          ) : (
            <>
              <div className="row">
                <div className="status grow">
                  <span className="dot on" /> {setup.lovable.viaKey ? "Connected to the workspace configured on this server" : "Logged in to Lovable"}
                </div>
                {setup.lovable.connected && (
                  <button className="btn ghost" onClick={() => api("/api/auth/lovable/logout", { method: "POST" }).then(onRefresh)}>Log out</button>
                )}
              </div>
              {!setup.setup.embedAvailable && (
                <div className="notice warn">
                  Lovable previews only load on HTTPS. Set <code>APP_URL</code> to this app&apos;s public https:// address, or use the URL tab.
                </div>
              )}
              <input type="search" placeholder="Search projects…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginTop: 12 }} />
              {!projects ? (
                <div className="row" style={{ marginTop: 12 }}><Spinner /> Loading projects…</div>
              ) : projects.length === 0 ? (
                <p className="sub" style={{ marginTop: 12 }}>No projects found.</p>
              ) : (
                <div className="projects">
                  {projects.map((p) => (
                    <button key={p.id} className={`project ${project?.id === p.id ? "on" : ""}`} onClick={() => setProject(p)}>
                      <div className="shot" style={p.screenshotUrl ? { backgroundImage: `url(${p.screenshotUrl})` } : undefined} />
                      <div className="meta">
                        <b>{p.name}</b>
                        <small>{p.isPublished ? "Published" : "Draft"}{p.lastEditedAt ? ` · ${new Date(p.lastEditedAt).toLocaleDateString()}` : ""}</small>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {mode === "url" && (
        <label className="field">
          <span>Published site URL</span>
          <input type="url" placeholder="https://your-project.lovable.app" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
      )}

      <div className="row" style={{ marginTop: 16, alignItems: "flex-start" }}>
        <label className="field grow">
          <span>Pages</span>
          <input type="text" value={routes} onChange={(e) => setRoutes(e.target.value)} />
          <small>Routes to convert, separated by commas: / , /about , /pricing</small>
        </label>
        <label className="field grow">
          <span>Theme name</span>
          <input type="text" placeholder={project?.name ?? "my-landing"} value={themeName} onChange={(e) => setThemeName(e.target.value)} />
          <small>Folder name in the HubSpot Design Manager.</small>
        </label>
      </div>

      <button className="btn primary" disabled={!canConvert || busy} onClick={convert}>
        {busy ? <><Spinner /> Rendering and converting…</> : "Convert"}
      </button>
      {busy && <p className="sub" style={{ marginTop: 8 }}>This opens the site in a headless browser; it can take up to a minute.</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ step 2 */

function ReviewStep({ job, onChange, onReset, onError }: {
  job: JobSummary;
  onChange: (j: JobSummary) => void;
  onReset: () => void;
  onError: (e: string | null) => void;
}) {
  const patch = useCallback(
    async (body: unknown) => {
      try {
        onChange(await api<JobSummary>(`/api/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify(body) }));
      } catch (e) {
        onError((e as Error).message);
      }
    },
    [job.id, onChange, onError],
  );

  const counts = useMemo(() => {
    const included = job.modules.filter((m) => m.included);
    return { modules: included.length, fields: included.reduce((n, m) => n + m.fields.length, 0) };
  }, [job.modules]);

  return (
    <section className="card">
      <div className="row">
        <div className="grow">
          <h2>{job.source.label}</h2>
          <p className="sub" style={{ margin: 0 }}>
            {job.pages.length} page{job.pages.length > 1 ? "s" : ""} · {counts.modules} modules · {counts.fields} editable fields · {job.assets} images and fonts
          </p>
        </div>
        <button className="btn ghost" onClick={onReset}>Start over</button>
      </div>

      <div className="row" style={{ marginTop: 16, alignItems: "flex-start" }}>
        <label className="field grow">
          <span>Theme label</span>
          <input type="text" defaultValue={job.theme.label} onBlur={(e) => e.target.value !== job.theme.label && patch({ theme: { label: e.target.value } })} />
        </label>
        <label className="field grow">
          <span>Theme folder</span>
          <input type="text" defaultValue={job.theme.name} onBlur={(e) => e.target.value !== job.theme.name && patch({ theme: { name: e.target.value } })} />
        </label>
      </div>

      {job.warnings.length > 0 && (
        <div className="notice warn">
          Heads up:
          <ul>{job.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      <div className="modules">
        {job.modules.map((m) => (
          <article key={m.id} className={`module ${m.included ? "" : "off"}`}>
            <div className="preview">
              <iframe src={`/api/jobs/${job.id}/preview/${m.id}`} title={`Preview of ${m.label}`} loading="lazy" sandbox="allow-same-origin" />
            </div>
            <div>
              <div className="row">
                <span className="kind grow">{m.kind === "section" ? "Drag-and-drop section" : `Fixed ${m.kind}`}</span>
                <label className="toggle">
                  <input type="checkbox" checked={m.included} onChange={(e) => patch({ modules: [{ id: m.id, included: e.target.checked }] })} />
                  Include
                </label>
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <input
                  type="text"
                  aria-label="Module label"
                  defaultValue={m.label}
                  key={`l-${m.label}`}
                  onBlur={(e) => e.target.value !== m.label && patch({ modules: [{ id: m.id, label: e.target.value }] })}
                  style={{ fontWeight: 600 }}
                  className="grow"
                />
                <input
                  type="text"
                  aria-label="Module folder"
                  defaultValue={m.name}
                  key={`n-${m.name}`}
                  onBlur={(e) => e.target.value !== m.name && patch({ modules: [{ id: m.id, name: e.target.value }] })}
                  style={{ maxWidth: 200, fontFamily: "ui-monospace, monospace", fontSize: 13 }}
                />
              </div>
              <div className="chips">
                {m.fields.length === 0 && <span className="chip">Static, no editable fields</span>}
                {m.fields.map((f) => (
                  <span key={f.name} className="chip" title={f.label}>
                    <b>{f.type === "group" ? `${f.items}× repeater` : f.type}</b> {f.type === "group" ? f.children?.map((c) => c.type).join(", ") : f.label.replace(/^[A-Za-z]+ \d+ – /, "")}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ step 3 */

function PublishStep({ job, setup, onError, onRefresh }: {
  job: JobSummary;
  setup: Setup;
  onError: (e: string | null) => void;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const hubspot = setup.hubspot;

  const publish = async () => {
    onError(null);
    setBusy(true);
    setResult(null);
    try {
      setResult(await api<PublishResult>(`/api/jobs/${job.id}/publish`, { method: "POST" }));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const failed = result?.steps.filter((s) => s.status === "failed") ?? [];

  return (
    <section className="card">
      <h2>Publish to HubSpot</h2>
      <p className="sub">
        Images and fonts go to your File Manager; the theme goes to the Design Manager as <code>{job.theme.name}/</code>. Publishing again overwrites it.
      </p>

      {!hubspot ? (
        setup.setup.hubspotOAuth ? (
          <a className="btn hubspot" href="/api/auth/hubspot/login">Log in with HubSpot</a>
        ) : (
          <div className="notice">HubSpot login isn&apos;t configured on this server (<code>HUBSPOT_CLIENT_ID</code> or <code>HUBSPOT_ACCESS_TOKEN</code>). You can still download the theme. <a href="/tutorial#setup">How to set it up</a></div>
        )
      ) : (
        <div className="row">
          <div className="status grow">
            <span className="dot on" /> Portal {hubspot.portalId}{hubspot.hubDomain ? ` · ${hubspot.hubDomain}` : ""}
          </div>
          {!hubspot.viaToken && (
            <button className="btn ghost" onClick={() => api("/api/auth/hubspot/logout", { method: "POST" }).then(onRefresh)}>Switch account</button>
          )}
        </div>
      )}

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn hubspot" disabled={!hubspot || busy} onClick={publish}>
          {busy ? <><Spinner /> Publishing…</> : "Publish theme"}
        </button>
        <a className="btn" href={`/api/jobs/${job.id}/zip`}>Download .zip</a>
      </div>

      {result && (
        <div style={{ marginTop: 16 }}>
          {result.ok ? (
            <div className="notice">
              Done. Open the <a href={result.designManagerUrl} target="_blank" rel="noreferrer">Design Manager</a>, then create a page in
              HubSpot and pick the <b>{job.theme.label}</b> template.
            </div>
          ) : (
            <div className="notice error">
              {failed.length} file{failed.length > 1 ? "s" : ""} failed. The rest was uploaded; check the errors below: you can exclude that module in the review step and publish again, or open an issue with the error.
            </div>
          )}
          <div className="log">
            {result.steps.map((s) => (
              <div key={s.path} className={s.status === "uploaded" ? "ok" : s.status === "failed" ? "bad" : "skip"}>
                {s.status === "uploaded" ? "✓" : s.status === "failed" ? "✗" : "–"} {s.path}
                {s.error ? ` — ${s.error}` : ""}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
