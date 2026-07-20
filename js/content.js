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
  // the selection popup starts as a small pill; the caret opens a small menu
  // (not a full card) so it stays compact (users found the card intrusive)
  const PILL_W = 104, PILL_H = 30, MENU_W = 178, TR_W = 300;
  let ACCENT = "#ff4d55", ACCENT_INK = "#1a1a1c", ACCENT_SOFT = "rgba(255,77,85,0.16)";
  let TRANSLATE_TO = "en";
  const TARGETS = [
    ["en", "English"], ["ar", "العربية"], ["fr", "Français"], ["es", "Español"],
    ["de", "Deutsch"], ["it", "Italiano"], ["pt", "Português"], ["ru", "Русский"],
    ["ja", "日本語"], ["zh-CN", "中文"], ["hi", "हिन्दी"], ["tr", "Türkçe"],
  ];
  try {
    chrome.storage?.local?.get(["accentColor", "accentInk", "accentSoftRgb", "translateTo"], (r) => {
      if (r.accentColor) ACCENT = r.accentColor;
      if (r.accentInk) ACCENT_INK = r.accentInk;
      if (r.accentSoftRgb) ACCENT_SOFT = "rgba(" + r.accentSoftRgb + ",0.16)";
      if (r.translateTo) TRANSLATE_TO = r.translateTo;
    });
    chrome.storage?.onChanged?.addListener((ch, area) => {
      if (area !== "local") return;
      if (ch.accentColor) ACCENT = ch.accentColor.newValue || ACCENT;
      if (ch.accentInk) ACCENT_INK = ch.accentInk.newValue || ACCENT_INK;
      if (ch.accentSoftRgb) ACCENT_SOFT = "rgba(" + ch.accentSoftRgb.newValue + ",0.16)";
      if (ch.translateTo) TRANSLATE_TO = ch.translateTo.newValue || TRANSLATE_TO;
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

  // Position the bubble over/under the selection for a given size.
  function place(w, h) {
    const r = curRect;
    const above = r.top > h + 24;
    bubble.style.width = w + "px";
    bubble.style.left =
      Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
    bubble.style.top = (above ? r.top - h - 10 : r.bottom + 10) + "px";
  }

  // place using the bubble's own rendered height (for variable-height menus)
  function placeMeasured(w) {
    bubble.style.width = w + "px";
    place(w, bubble.getBoundingClientRect().height || 110);
  }

  // place using the bubble's own rendered width AND height (auto-sized pill)
  function placeAuto() {
    bubble.style.width = "auto";
    const rc = bubble.getBoundingClientRect();
    place(Math.round(rc.width), Math.round(rc.height));
  }

  function saveItem(tags) {
    try {
      StashCore.addItem({
        id: StashCore.newId(),
        name: curText,
        url: location.href,
        tags,
        done: false,
        added: Date.now(),
      });
    } catch {}
  }

  /* Selecting text shows only this small pill — one click saves, the caret
     expands the full card for categories. Keeps the page uncluttered. */
  function showBubble() {
    hoverTimer = null;
    if (bubble || !curText || !curRect) return;

    bubble = document.createElement("div");
    bubble.style.cssText =
      "all:initial;position:fixed;z-index:2147483647;box-sizing:border-box;font-family:" + FONT + ";";
    bubble.appendChild(buildPill());
    document.body.appendChild(bubble);
    placeAuto();
    bubble.addEventListener("mouseenter", () => { overBubble = true; });
    bubble.addEventListener("mouseleave", () => { overBubble = false; hideBubble(); });
  }

  function buildPill() {
    const pill = document.createElement("div");
    pill.style.cssText =
      "box-sizing:border-box;display:flex;align-items:center;height:" + PILL_H + "px;" +
      "background:rgba(18,18,24,0.96);border:1px solid rgba(255,255,255,0.12);" +
      "border-radius:999px;box-shadow:0 6px 18px rgba(0,0,0,0.35);overflow:hidden;";
    pill.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });

    const main = document.createElement("div");
    main.style.cssText =
      "display:flex;align-items:center;gap:6px;padding:0 11px;height:100%;cursor:pointer;" +
      "color:#f4f4f6;font-size:12px;font-weight:600;";
    main.innerHTML =
      "<svg viewBox='0 0 24 24' width='13' height='13' fill='none' stroke='" + ACCENT + "' stroke-width='2' " +
      "stroke-linecap='round' stroke-linejoin='round'><path d='M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z'/></svg>" +
      "<span>Save</span>";
    main.addEventListener("mouseenter", () => (main.style.background = "rgba(255,255,255,0.07)"));
    main.addEventListener("mouseleave", () => (main.style.background = "transparent"));
    main.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      saveItem([]);
      main.querySelector("span").textContent = "Saved";
      main.style.color = "#4ade80";
      setTimeout(hideBubble, 600);
    });

    // translate segment
    const tr = document.createElement("div");
    tr.title = "translate selection";
    tr.style.cssText =
      "display:flex;align-items:center;gap:5px;padding:0 11px;height:100%;cursor:pointer;" +
      "color:#f4f4f6;font-size:12px;font-weight:600;border-left:1px solid rgba(255,255,255,0.12);";
    tr.innerHTML =
      "<svg viewBox='0 0 24 24' width='13' height='13' fill='none' stroke='" + ACCENT + "' stroke-width='2' " +
      "stroke-linecap='round' stroke-linejoin='round'><path d='M4 5h7M9 3v2c0 4-2 7-5 8'/><path d='M5 9c0 3 3 5 6 6'/>" +
      "<path d='M13 19l4-9 4 9M14.5 16h5'/></svg><span>Translate</span>";
    tr.addEventListener("mouseenter", () => (tr.style.background = "rgba(255,255,255,0.07)"));
    tr.addEventListener("mouseleave", () => (tr.style.background = "transparent"));
    tr.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!bubble) return;
      bubble.innerHTML = "";
      bubble.appendChild(buildTranslation());
      placeMeasured(TR_W);
    });

    const more = document.createElement("div");
    more.title = "choose a category";
    more.textContent = "▾";
    more.style.cssText =
      "display:flex;align-items:center;padding:0 9px;height:100%;cursor:pointer;font-size:9px;" +
      "color:rgba(244,244,246,0.55);border-left:1px solid rgba(255,255,255,0.12);";
    more.addEventListener("mouseenter", () => (more.style.background = "rgba(255,255,255,0.07)"));
    more.addEventListener("mouseleave", () => (more.style.background = "transparent"));
    more.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!bubble) return;
      bubble.innerHTML = "";
      bubble.appendChild(buildMenu());
      placeMeasured(MENU_W);
    });

    pill.appendChild(main);
    pill.appendChild(tr);
    pill.appendChild(more);
    return pill;
  }

  /* Translation panel: shows the translated text, the detected source language,
     and a target-language picker (remembered for next time). */
  function buildTranslation() {
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "box-sizing:border-box;background:rgba(18,18,24,0.98);border:1px solid rgba(255,255,255,0.12);" +
      "border-radius:14px;padding:12px 13px;box-shadow:0 12px 30px rgba(0,0,0,0.5);";
    wrap.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });

    // header: label + target language selector
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px;";
    const srcLbl = document.createElement("div");
    srcLbl.textContent = "translating…";
    srcLbl.style.cssText = "font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:rgba(244,244,246,0.5);";

    const langSel = document.createElement("select");
    langSel.style.cssText =
      "all:unset;box-sizing:border-box;cursor:pointer;font-family:" + FONT + ";font-size:11px;color:#f4f4f6;" +
      "background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:3px 7px;";
    langSel.innerHTML = TARGETS
      .map(([c, n]) => "<option value='" + c + "'" + (c === TRANSLATE_TO ? " selected" : "") + ">" + n + "</option>")
      .join("");
    langSel.addEventListener("mousedown", (e) => e.stopPropagation());
    langSel.addEventListener("change", () => {
      TRANSLATE_TO = langSel.value;
      try { chrome.storage?.local?.set({ translateTo: TRANSLATE_TO }); } catch {}
      run();
    });
    head.appendChild(srcLbl); head.appendChild(langSel);

    const body = document.createElement("div");
    body.style.cssText =
      "font-size:13px;line-height:1.45;color:#f4f4f6;max-height:180px;overflow:auto;white-space:pre-wrap;word-break:break-word;";
    body.textContent = "…";

    const foot = document.createElement("div");
    foot.style.cssText = "display:flex;justify-content:flex-end;margin-top:9px;";
    const copy = document.createElement("button");
    copy.textContent = "copy";
    copy.style.cssText =
      "all:unset;cursor:pointer;font-family:" + FONT + ";font-size:11px;font-weight:600;color:rgba(244,244,246,0.7);" +
      "background:rgba(255,255,255,0.06);border-radius:8px;padding:4px 10px;";
    copy.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      try { navigator.clipboard.writeText(body.textContent); copy.textContent = "copied"; } catch {}
    });
    foot.appendChild(copy);

    function run() {
      srcLbl.textContent = "translating…";
      body.textContent = "…";
      const wanted = curText;
      try {
        chrome.runtime.sendMessage({ type: "translate", text: wanted, to: TRANSLATE_TO }, (resp) => {
          if (!bubble || curText !== wanted) return; // selection changed / closed
          if (chrome.runtime.lastError || !resp) { srcLbl.textContent = "translate"; body.textContent = "couldn't translate right now."; return; }
          if (!resp.ok) { srcLbl.textContent = "translate"; body.textContent = resp.error || "couldn't translate."; return; }
          const name = (TARGETS.find(([c]) => c === TRANSLATE_TO) || [, TRANSLATE_TO])[1];
          srcLbl.textContent = (resp.src || "auto") + " → " + name;
          body.textContent = resp.text || "(no translation)";
          placeMeasured(TR_W);
        });
      } catch { srcLbl.textContent = "translate"; body.textContent = "couldn't translate here."; }
    }

    wrap.appendChild(head);
    wrap.appendChild(body);
    wrap.appendChild(foot);
    run();
    return wrap;
  }

  /* Small category menu shown from the caret — a compact chip picker + Save,
     not the old full-width card. */
  function buildMenu() {
    const sel = new Set();

    const wrap = document.createElement("div");
    wrap.style.cssText =
      "box-sizing:border-box;background:rgba(18,18,24,0.98);border:1px solid rgba(255,255,255,0.12);" +
      "border-radius:12px;padding:10px 11px;box-shadow:0 10px 28px rgba(0,0,0,0.45);";
    wrap.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });

    const label = document.createElement("div");
    label.textContent = "save to";
    label.style.cssText =
      "font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;" +
      "color:rgba(244,244,246,0.5);margin-bottom:8px;";

    const chips = document.createElement("div");
    chips.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;";
    const off = "font-size:11px;border-radius:999px;padding:3px 9px;cursor:pointer;user-select:none;" +
      "border:1px solid rgba(255,255,255,0.16);color:#f4f4f6;background:rgba(255,255,255,0.05);";
    const on = "font-size:11px;border-radius:999px;padding:3px 9px;cursor:pointer;user-select:none;" +
      "border:1px solid transparent;color:" + ACCENT_INK + ";background:" + ACCENT + ";";

    const cats = (typeof StashCore !== "undefined" ? StashCore.loadTags() : []);
    if (!cats.length) {
      const none = document.createElement("div");
      none.textContent = "no categories yet";
      none.style.cssText = "font-size:11px;color:rgba(244,244,246,0.4);";
      chips.appendChild(none);
    }
    cats.forEach((c) => {
      const chip = document.createElement("div");
      chip.textContent = c;
      chip.style.cssText = off;
      chip.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        if (sel.has(c)) { sel.delete(c); chip.style.cssText = off; }
        else { sel.add(c); chip.style.cssText = on; }
      });
      chips.appendChild(chip);
    });

    const save = document.createElement("button");
    save.textContent = "Save";
    save.style.cssText =
      "all:unset;box-sizing:border-box;display:block;width:100%;text-align:center;margin-top:10px;" +
      "font-family:" + FONT + ";font-size:12px;font-weight:700;color:" + ACCENT_INK + ";background:" + ACCENT + ";" +
      "border-radius:9px;padding:7px 0;cursor:pointer;";
    save.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      saveItem([...sel]);
      save.textContent = "✓ Saved";
      save.style.background = "#4ade80";
      setTimeout(hideBubble, 600);
    });

    wrap.appendChild(label);
    wrap.appendChild(chips);
    wrap.appendChild(save);
    return wrap;
  }

})();
