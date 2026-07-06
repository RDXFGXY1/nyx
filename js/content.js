/* =========================================================
   content.js — runs on every page.
   Select text → hover ~500ms → a "Save to Stash" card pops
   up right there. Pick tags on it and save directly into the
   stash (no extra window). Shares chrome.storage with the
   new-tab board, so saves show up there instantly.
   ========================================================= */

(() => {
  if (window.__stashBubbleLoaded) return;
  window.__stashBubbleLoaded = true;

  if (typeof StashCore !== "undefined") StashCore.init();

  const HOVER_MS = 500;
  const FONT = "-apple-system,'Segoe UI',Roboto,sans-serif";
  const CARD_W = 260;
  let ACCENT = "#ff4d55", ACCENT_INK = "#1a1a1c", ACCENT_SOFT = "rgba(255,77,85,0.16)";
  try {
    chrome.storage?.local?.get(["accentColor", "accentInk", "accentSoftRgb"], (r) => {
      if (r.accentColor) ACCENT = r.accentColor;
      if (r.accentInk) ACCENT_INK = r.accentInk;
      if (r.accentSoftRgb) ACCENT_SOFT = "rgba(" + r.accentSoftRgb + ",0.16)";
    });
    chrome.storage?.onChanged?.addListener((ch, area) => {
      if (area !== "local") return;
      if (ch.accentColor) ACCENT = ch.accentColor.newValue || ACCENT;
      if (ch.accentInk) ACCENT_INK = ch.accentInk.newValue || ACCENT_INK;
      if (ch.accentSoftRgb) ACCENT_SOFT = "rgba(" + ch.accentSoftRgb.newValue + ",0.16)";
    });
  } catch {}

  let bubble = null;
  let hoverTimer = null;
  let curText = "";
  let curRect = null;
  let overBubble = false;
  const mouse = { x: 0, y: 0 };

  function readSelection() {
    const s = window.getSelection();
    if (!s || s.isCollapsed) return null;
    const text = s.toString().trim();
    if (text.length < 2) return null;
    let rect;
    try { rect = s.getRangeAt(0).getBoundingClientRect(); } catch { return null; }
    if (!rect || (!rect.width && !rect.height)) return null;
    return { text, rect };
  }

  function insideSel() {
    if (!curRect) return false;
    const r = curRect, pad = 10;
    return mouse.x >= r.left - pad && mouse.x <= r.right + pad &&
           mouse.y >= r.top - pad && mouse.y <= r.bottom + pad;
  }

  function arm() {
    if (bubble || hoverTimer || !curText || !curRect || !insideSel()) return;
    hoverTimer = setTimeout(showBubble, HOVER_MS);
  }
  function disarm() { clearTimeout(hoverTimer); hoverTimer = null; }

  function publishRpcPage() {
    try {
      chrome.runtime.sendMessage({
        type: "rpc-page",
        title: document.title || "",
        url: location.href,
      });
    } catch {}
  }

  publishRpcPage();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) publishRpcPage();
  });
  window.addEventListener("pageshow", publishRpcPage, { passive: true });
  window.addEventListener("popstate", publishRpcPage, { passive: true });
  const titleObserver = new MutationObserver(() => publishRpcPage());
  const titleNode = document.querySelector("title");
  if (titleNode) titleObserver.observe(titleNode, { childList: true, subtree: true, characterData: true });

  document.addEventListener("selectionchange", () => {
    const sel = readSelection();
    if (!sel) { curText = ""; curRect = null; disarm(); if (!overBubble) hideBubble(); }
    else { curText = sel.text; curRect = sel.rect; }
  });

  document.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (bubble) return;
    if (insideSel()) arm(); else disarm();
  }, { passive: true });

  document.addEventListener("mouseup", () => {
    setTimeout(() => {
      const sel = readSelection();
      if (sel) { curText = sel.text; curRect = sel.rect; arm(); }
    }, 10);
  });

  window.addEventListener("scroll", () => { if (bubble) hideBubble(); }, { passive: true });

  function hideBubble() {
    if (bubble) { bubble.remove(); bubble = null; }
    overBubble = false;
  }

  function showBubble() {
    hoverTimer = null;
    if (bubble || !curText || !curRect) return;
    const r = curRect;
    const host = location.hostname.replace(/^www\./, "");
    const title = curText.length > 70 ? curText.slice(0, 68) + "…" : curText;
    const sel = new Set();

    const above = r.top > 200;
    bubble = document.createElement("div");
    bubble.style.cssText =
      "all:initial;position:fixed;z-index:2147483647;box-sizing:border-box;width:" + CARD_W + "px;" +
      "left:" + Math.max(8, Math.min(window.innerWidth - CARD_W - 8, r.left + r.width / 2 - CARD_W / 2)) + "px;" +
      "top:" + (above ? r.top - 168 : r.bottom + 12) + "px;font-family:" + FONT + ";";

    const card = document.createElement("div");
    card.style.cssText =
      "box-sizing:border-box;background:rgba(18,18,24,0.98);border:1px solid rgba(255,255,255,0.14);" +
      "border-radius:16px;padding:13px 14px;box-shadow:0 16px 44px rgba(0,0,0,0.5);";
    card.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });

    // header: title + bookmark icon
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:flex-start;gap:10px;";
    const titleEl = document.createElement("div");
    titleEl.textContent = title;
    titleEl.style.cssText =
      "flex:1;min-width:0;font-size:14px;font-weight:700;line-height:1.3;color:#f4f4f6;" +
      "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;";
    const icon = document.createElement("div");
    icon.innerHTML =
      "<svg viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor' stroke-width='2' " +
      "stroke-linecap='round' stroke-linejoin='round'><path d='M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z'/></svg>";
    icon.style.cssText =
      "flex:none;width:30px;height:30px;border-radius:9px;background:" + ACCENT_SOFT + ";color:" + ACCENT + ";" +
      "display:flex;align-items:center;justify-content:center;";
    row.appendChild(titleEl); row.appendChild(icon);

    // source
    const sub = document.createElement("div");
    sub.textContent = host;
    sub.style.cssText = "margin-top:8px;font-size:11px;color:rgba(244,244,246,0.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

    // custom category dropdown (lives INSIDE the card so it stays open + styled)
    const catWrap = document.createElement("div");
    catWrap.style.cssText = "margin-top:11px;";

    const trigger = document.createElement("div");
    trigger.style.cssText =
      "box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;" +
      "font-family:" + FONT + ";font-size:12px;color:#f4f4f6;background:rgba(255,255,255,0.06);" +
      "border:1px solid rgba(255,255,255,0.16);border-radius:10px;padding:9px 12px;cursor:pointer;user-select:none;";
    trigger.innerHTML = "<span style='color:rgba(244,244,246,0.7)'>＋ add category</span><span style='opacity:0.5;font-size:10px' class='__chev'>▼</span>";

    const list = document.createElement("div");
    list.style.cssText =
      "display:none;margin-top:6px;max-height:150px;overflow:auto;box-sizing:border-box;" +
      "background:rgba(30,30,38,0.98);border:1px solid rgba(255,255,255,0.14);border-radius:10px;";

    const selBox = document.createElement("div");
    selBox.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;";

    function buildList() {
      const cats = (typeof StashCore !== "undefined" ? StashCore.loadTags() : []).filter((c) => !sel.has(c));
      list.innerHTML = "";
      if (!cats.length) {
        const empty = document.createElement("div");
        empty.textContent = "no more categories";
        empty.style.cssText = "padding:9px 12px;font-size:12px;color:rgba(244,244,246,0.4);";
        list.appendChild(empty);
        return;
      }
      cats.forEach((c) => {
        const opt = document.createElement("div");
        opt.textContent = c;
        opt.style.cssText = "padding:9px 12px;font-size:12px;color:#f4f4f6;cursor:pointer;";
        opt.addEventListener("mouseenter", () => (opt.style.background = "rgba(255,255,255,0.07)"));
        opt.addEventListener("mouseleave", () => (opt.style.background = "transparent"));
        opt.addEventListener("mousedown", (e) => {
          e.preventDefault(); e.stopPropagation();
          sel.add(c); list.style.display = "none"; trigger.querySelector(".__chev").textContent = "▼";
          refillSel();
        });
        list.appendChild(opt);
      });
    }

    function refillSel() {
      selBox.innerHTML = "";
      [...sel].forEach((c) => {
        const chip = document.createElement("span");
        chip.textContent = c;
        chip.style.cssText =
          "display:inline-flex;align-items:center;gap:5px;font-size:11px;color:" + ACCENT_INK + ";background:" + ACCENT + ";" +
          "border-radius:999px;padding:3px 5px 3px 10px;";
        const x = document.createElement("span");
        x.textContent = "✕";
        x.style.cssText = "cursor:pointer;background:rgba(0,0,0,0.18);border-radius:50%;width:14px;height:14px;display:inline-grid;place-items:center;font-size:8px;";
        x.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); sel.delete(c); refillSel(); });
        chip.appendChild(x);
        selBox.appendChild(chip);
      });
      buildList();
    }

    trigger.addEventListener("mousedown", (e) => {
      e.preventDefault(); e.stopPropagation();
      const open = list.style.display === "none";
      list.style.display = open ? "block" : "none";
      trigger.querySelector(".__chev").textContent = open ? "▲" : "▼";
    });

    refillSel();
    catWrap.appendChild(trigger);
    catWrap.appendChild(list);
    catWrap.appendChild(selBox);

    // save button
    const save = document.createElement("button");
    save.textContent = "Save to Stash";
    save.style.cssText =
      "all:unset;box-sizing:border-box;display:block;width:100%;text-align:center;margin-top:12px;" +
      "font-family:" + FONT + ";font-size:13px;font-weight:700;color:" + ACCENT_INK + ";background:" + ACCENT + ";" +
      "border-radius:11px;padding:9px 0;cursor:pointer;";
    save.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      try {
        StashCore.addItem({
          id: StashCore.newId(),
          name: curText,
          url: location.href,
          tags: [...sel],
          done: false,
          added: Date.now(),
        });
      } catch {}
      save.textContent = "✓ Saved";
      save.style.background = "#4ade80";
      icon.style.background = "rgba(74,222,128,0.16)";
      icon.style.color = "#4ade80";
      setTimeout(hideBubble, 700);
    });

    card.appendChild(row);
    card.appendChild(sub);
    card.appendChild(catWrap);
    card.appendChild(save);

    bubble.appendChild(card);
    bubble.addEventListener("mouseenter", () => { overBubble = true; });
    bubble.addEventListener("mouseleave", () => { overBubble = false; hideBubble(); });
    document.body.appendChild(bubble);
  }
})();
