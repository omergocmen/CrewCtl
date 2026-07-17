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

  // Paylasilan sik onay modali — native confirm() yerine Promise<boolean> doner.
  // opts: { title, body, confirmLabel, cancelLabel, danger(=true) }
  const ICON_WARN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>';
  const ICON_INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9.2"/><path d="M12 11v5M12 7.6h.01"/></svg>';
  const escHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  window.appConfirm = function (opts) {
    opts = opts || {};
    const danger = opts.danger !== false;
    return new Promise((resolve) => {
      const prev = document.activeElement;
      const overlay = document.createElement("div");
      overlay.className = "app-modal";
      overlay.innerHTML =
        `<div class="app-dialog${danger ? " danger" : ""}" role="alertdialog" aria-modal="true">` +
        `<div class="app-dialog-head"><div class="app-dialog-ico">${danger ? ICON_WARN : ICON_INFO}</div>` +
        `<div class="app-dialog-title">${escHtml(opts.title || "Emin misiniz?")}</div></div>` +
        `<div class="app-dialog-body">${escHtml(opts.body || "")}</div>` +
        `<div class="app-dialog-foot"><button class="app-btn-cancel">${escHtml(opts.cancelLabel || "Vazgeç")}</button>` +
        `<button class="app-btn-confirm">${escHtml(opts.confirmLabel || "Onayla")}</button></div></div>`;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add("show"));
      const confirmBtn = overlay.querySelector(".app-btn-confirm");
      const cancelBtn = overlay.querySelector(".app-btn-cancel");
      const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(false); } else if (e.key === "Enter") { e.preventDefault(); close(true); } };
      function close(val) {
        overlay.classList.remove("show");
        document.removeEventListener("keydown", onKey, true);
        setTimeout(() => { try { overlay.remove(); } catch {} try { prev && prev.focus && prev.focus(); } catch {} }, 190);
        resolve(val);
      }
      cancelBtn.onclick = () => close(false);
      confirmBtn.onclick = () => close(true);
      overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(false); });
      document.addEventListener("keydown", onKey, true);
      setTimeout(() => { try { confirmBtn.focus(); } catch {} }, 60);
    });
  };
})();
