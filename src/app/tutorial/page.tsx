"use client";

import { useEffect, useState } from "react";
import { sections, ui, type Lang } from "./content";

export default function Tutorial() {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("h2h-lang");
    } catch {
      // Storage unavailable: fall back to the browser language.
    }
    if (saved === "it" || saved === "en") setLang(saved);
    else if (navigator.language.toLowerCase().startsWith("it")) setLang("it");
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const choose = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem("h2h-lang", l);
    } catch {
      // Not persisted; fine.
    }
  };

  const t = ui[lang];
  const list = sections[lang];

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/" style={{ textDecoration: "none" }}>
          <span className="l">Lovable</span>
          <span className="arrow">→</span>
          <span className="h">HubSpot</span>
        </a>
        <div className="tabs" role="group" aria-label="Language" style={{ margin: 0 }}>
          <button className={lang === "it" ? "on" : ""} aria-pressed={lang === "it"} onClick={() => choose("it")}>IT</button>
          <button className={lang === "en" ? "on" : ""} aria-pressed={lang === "en"} onClick={() => choose("en")}>EN</button>
        </div>
      </header>

      <h1 className="tut-title">{t.title}</h1>
      <p className="tagline">{t.intro}</p>

      <div className="tut">
        <nav className="toc" aria-label={t.toc}>
          <span>{t.toc}</span>
          <ol>
            {list.map((s) => (
              <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>
            ))}
          </ol>
          <a className="btn primary" href="/">{t.open}</a>
        </nav>

        <div className="tut-body">
          {list.map((s, i) => (
            <section key={s.id} id={s.id} className="card tut-section">
              <h2><span className="num">{i + 1}</span>{s.title}</h2>
              {s.body}
            </section>
          ))}
          <a className="btn ghost" href="/">{t.back}</a>
        </div>
      </div>
    </main>
  );
}
