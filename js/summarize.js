/* =========================================================
   summarize.js — runs on every page. Alt+W summarizes the
   page with your configured AI provider (>ai in the new tab):
   a TL;DR line + a few bullet points, in the page's language.
   Esc or clicking outside closes; "copy" copies the summary.
   ========================================================= */

(() => {
  if (window.__nyxSummarizeLoaded) return;
  window.__nyxSummarizeLoaded = true;

  let ACCENT = "#8ab4ff";
  try {
    chrome.storage?.local?.get("accentColor", (r) => { if (r.accentColor) ACCENT = r.accentColor; });
    chrome.storage?.onChanged?.addListener((ch, area) => {
      if (area === "local" && ch.accentColor) ACCENT = ch.accentColor.newValue || ACCENT;
    });
  } catch { return; /* no extension context */ }

  let POP = null, busy = false;

  function hide() { if (POP) POP.remove(); POP = null; }

  function box() {
    hide();
    POP = document.createElement("div");
    POP.id = "nyx-sum-pop";
    POP.setAttribute("style",
      "all:initial; position:fixed; z-index:2147483646; top:16px; right:16px; width:min(400px,90vw);" +
      "background:rgba(18,20,26,0.97); backdrop-filter:blur(12px);" +
      "border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:6px;" +
      "box-shadow:0 10px 34px rgba(0,0,0,0.5);" +
      "font:13px/1.5 system-ui,-apple-system,sans-serif; color:#e8eaef;");
    document.documentElement.appendChild(POP);
    return POP;
  }

  function row(children, onClick, style) {
    const r = document.createElement("div");
    r.setAttribute("style",
      "all:initial; display:block; padding:7px 11px; border-radius:8px; font:13px/1.5 system-ui; color:#e8eaef;" +
      (onClick ? "cursor:pointer;" : "cursor:default;") + (style || ""));
    if (onClick) {
      r.addEventListener("mousedown", (e) => { e.preventDefault(); onClick(); });
      r.addEventListener("mouseenter", () => (r.style.background = "rgba(255,255,255,0.10)"));
      r.addEventListener("mouseleave", () => (r.style.background = "transparent"));
    }
    for (const c of children) r.appendChild(c);
    return r;
  }

  function span(text, color, extra) {
    const s = document.createElement("span");
    s.setAttribute("style", "all:initial; font:inherit; color:" + (color || "#e8eaef") + ";" + (extra || ""));
    s.textContent = text;
    return s;
  }

  function pageText() {
    const main = document.querySelector("article") || document.querySelector("main") || document.body;
    return ((main && main.innerText) || "").replace(/\n{3,}/g, "\n\n").trim();
  }

  function summarize() {
    if (busy) return;
    busy = true;
    box();
    POP.appendChild(row([span("✦ ", ACCENT), span("summarizing this page…", "#aab")], null));

    try {
      chrome.runtime.sendMessage(
        { type: "ai-summarize", text: pageText().slice(0, 9000), title: document.title },
        (resp) => {
          busy = false;
          if (chrome.runtime.lastError || !POP) return hide();
          box();
          if (!resp || !resp.ok) {
            POP.appendChild(row([span("✕ ", "#e07878"), span((resp && resp.error) || "summary failed", "#aab")], null));
            setTimeout(hide, 3500);
            return;
          }
          POP.appendChild(row([span("✦ ", ACCENT), span("summary", "#aab", "font:600 12px system-ui;")],
            null, "display:flex; align-items:center;"));
          POP.appendChild(row([span(resp.text)], null,
            "white-space:pre-wrap; max-height:min(340px,60vh); overflow:auto;"));
          POP.appendChild(row([span("copy", ACCENT, "font-weight:600;")], () => {
            try { navigator.clipboard.writeText(resp.text); } catch {}
            hide();
          }, "text-align:center;"));
        }
      );
    } catch { busy = false; hide(); }
  }

  document.addEventListener("keydown", (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === "KeyW") {
      e.preventDefault(); e.stopPropagation();
      summarize();
      return;
    }
    if (POP && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hide(); }
  }, true);

  document.addEventListener("mousedown", (e) => {
    if (POP && !busy && !POP.contains(e.target)) hide();
  }, true);
})();
