// app.js — paylasilan ekran gecisi cilasi (uc sayfada defer ile yuklenir). Sayfa fade-in
// CSS'te; burada yumusak fade-OUT + ic .html navigasyonu yakalama var. Tamamen additive.
(function () {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Yumusak cikis: once fade-out, sonra git. Reduced-motion'da aninda gider.
  function navTo(url) {
    if (!url) return;
    if (reduce) { location.href = url; return; }
    try { document.body.classList.add("app-leaving"); } catch {}
    setTimeout(() => { location.href = url; }, 185);
  }
  window.navTo = navTo;

  // Ic .html linklerini (yeni sekme / modifier / dis link haric) yumusak gecisle ac.
  document.addEventListener("click", (event) => {
    const anchor = event.target.closest && event.target.closest("a[href]");
    if (!anchor) return;
    if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const href = anchor.getAttribute("href") || "";
    if (/^(https?:|mailto:|#)/i.test(href)) return;
    if (!/\.html(\?.*)?(#.*)?$/.test(href)) return;
    event.preventDefault();
    navTo(href);
  });

  // bfcache geri donuste yaprak/cikis durumunu temizle.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) document.body.classList.remove("app-leaving");
  });
})();
