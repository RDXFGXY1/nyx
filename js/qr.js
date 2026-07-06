/* =========================================================
   qr.js — runs on every page.
   Press Alt+Q → a QR code of the current page pops up. Scan
   it with your phone camera to open the page on your phone.
   Uses the local qrcode library (no data leaves your machine).
   ========================================================= */

(() => {
  if (window.__qrLoaded) return;
  window.__qrLoaded = true;

  let overlay = null;

  function hideQR() { if (overlay) { overlay.remove(); overlay = null; } }

  function showQR() {
    if (overlay) return hideQR();
    if (typeof qrcode === "undefined") return;
    const url = location.href;
    let dataUrl;
    try {
      const qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      dataUrl = qr.createDataURL(6, 12);
    } catch { return; }

    overlay = document.createElement("div");
    overlay.style.cssText =
      "all:initial;position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.6);" +
      "display:flex;align-items:center;justify-content:center;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;";
    const card = document.createElement("div");
    card.style.cssText =
      "box-sizing:border-box;background:#fff;border-radius:18px;padding:22px;text-align:center;" +
      "box-shadow:0 20px 60px rgba(0,0,0,0.5);max-width:320px;";
    card.innerHTML =
      "<img src='" + dataUrl + "' alt='QR' style='width:240px;height:240px;image-rendering:pixelated;border-radius:8px;display:block;margin:0 auto'/>" +
      "<div style='font-size:12px;color:#333;margin-top:12px;word-break:break-all;max-height:46px;overflow:hidden'>" +
      url.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</div>" +
      "<div style='font-size:11px;color:#888;margin-top:8px'>scan with your phone camera · Esc to close</div>";
    overlay.appendChild(card);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) hideQR(); });
    document.body.appendChild(overlay);
  }

  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.key.toLowerCase() === "q") { e.preventDefault(); showQR(); }
    if (e.key === "Escape") hideQR();
  });
})();
