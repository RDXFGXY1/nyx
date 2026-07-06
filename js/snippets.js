/* =========================================================
   snippets.js — runs on every page.
   Type a trigger (e.g. ;addr) in any text box and it expands
   to your saved text. Snippets live in chrome.storage.local,
   managed from the new-tab side panel (Snips tab).
   ========================================================= */

(() => {
  if (window.__snipLoaded) return;
  window.__snipLoaded = true;

  let SNIPS = [];
  try {
    chrome.storage?.local?.get("snippets", (r) => { SNIPS = Array.isArray(r.snippets) ? r.snippets : []; });
    chrome.storage?.onChanged?.addListener((ch, area) => {
      if (area === "local" && ch.snippets) SNIPS = ch.snippets.newValue || [];
    });
  } catch { /* no extension context */ }

  document.addEventListener("input", (e) => {
    if (!SNIPS.length) return;
    const el = e.target;
    if (!el) return;

    // plain inputs / textareas
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      const pos = el.selectionStart;
      if (pos == null) return;
      const before = el.value.slice(0, pos);
      for (const s of SNIPS) {
        if (before.endsWith(s.trigger)) {
          const start = pos - s.trigger.length;
          el.value = el.value.slice(0, start) + s.text + el.value.slice(pos);
          const np = start + s.text.length;
          try { el.setSelectionRange(np, np); } catch {}
          el.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
      }
      return;
    }

    // contenteditable (Gmail, Discord, etc.)
    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType !== 3) return; // text node only
      const pos = range.startOffset;
      const before = node.textContent.slice(0, pos);
      for (const s of SNIPS) {
        if (before.endsWith(s.trigger)) {
          const start = pos - s.trigger.length;
          node.textContent = node.textContent.slice(0, start) + s.text + node.textContent.slice(pos);
          const np = start + s.text.length;
          try { range.setStart(node, np); range.setEnd(node, np); sel.removeAllRanges(); sel.addRange(range); } catch {}
          return;
        }
      }
    }
  }, true);
})();
