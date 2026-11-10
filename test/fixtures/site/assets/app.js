const root = document.getElementById("root");
root.innerHTML = `
<div class="min-h-screen">
  <header><a href="/"><img src="/assets/logo.svg" alt="Logo" width="40" height="40"></a><a href="/about?x=1">Chi siamo</a></header>
  <main>
    <section class="hero"><h1>Benvenuto</h1><p>Rendered by JavaScript</p></section>
    <section id="servizi"><h2>Servizi</h2>
      <div class="grid">
        <div class="card"><h3>Uno</h3><p>Primo</p></div>
        <div class="card"><h3>Due</h3><p>Secondo</p></div>
      </div>
      <div id="late" style="opacity: 0; transform: translateY(20px)">Arrivo allo scroll</div>
    </section>
  </main>
  <footer><p>Footer</p></footer>
</div>`;
// Simulates whileInView: reveal on scroll
window.addEventListener("scroll", () => { if (window.scrollY > 0) { const el = document.getElementById("late"); el.style.opacity = "1"; el.style.transform = "none"; } });
