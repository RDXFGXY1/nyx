/* =========================================================
   translate.js — the new-tab translate panel.
   Type/paste on the left, translation on the right. Source
   auto-detects (or pick one), target is remembered. Uses the
   background worker's translate handler (Google's free gtx).
   Open with Alt+G or >translate.
   ========================================================= */

const TR = {
  to: "en",
  from: "auto",
  detected: "en",
  q: "",
  timer: null,
  LANGS: [
    ["en", "English"], ["ar", "العربية"], ["fr", "Français"], ["es", "Español"],
    ["de", "Deutsch"], ["it", "Italiano"], ["pt", "Português"], ["ru", "Русский"],
    ["ja", "日本語"], ["ko", "한국어"], ["zh-CN", "中文"], ["hi", "हिन्दी"],
    ["tr", "Türkçe"], ["nl", "Nederlands"], ["pl", "Polski"], ["sv", "Svenska"],
  ],
};

function trTranslateApi(text, to, from) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "translate", text, to, from }, (resp) => {
        if (chrome.runtime.lastError || !resp) resolve({ ok: false, error: "unavailable" });
        else resolve(resp);
      });
    } catch { resolve({ ok: false, error: "unavailable" }); }
  });
}

function fillLangSelect(sel, value, withAuto) {
  const opts = (withAuto ? [["auto", "detect language"]] : []).concat(TR.LANGS);
  sel.innerHTML = opts
    .map(([c, n]) => `<option value="${c}"${c === value ? " selected" : ""}>${n}</option>`)
    .join("");
}

function openTranslate(force, prefill) {
  const el = document.getElementById("translate");
  const show = force !== undefined ? force : el.classList.contains("hidden");
  el.classList.toggle("hidden", !show);
  document.body.classList.toggle("stash-open", show);
  if (!show) return;

  fillLangSelect(document.getElementById("trFrom"), TR.from, true);
  fillLangSelect(document.getElementById("trTo"), TR.to, false);

  const input = document.getElementById("trInput");
  if (prefill != null && prefill !== "") { input.value = prefill; TR.q = prefill; runTr(); }
  input.focus();
  input.select();
}

async function runTr() {
  const out = document.getElementById("trOutput");
  const status = document.getElementById("trStatus");
  const text = document.getElementById("trInput").value.trim();
  TR.q = text;
  if (!text) { out.textContent = ""; out.classList.add("empty"); status.textContent = ""; return; }

  out.classList.remove("empty");
  status.textContent = "translating…";
  const wanted = text;
  const resp = await trTranslateApi(text, TR.to, TR.from);
  if (TR.q !== wanted) return; // typed more since; a newer run owns the output

  if (!resp.ok) { status.textContent = "couldn't translate"; return; }
  out.textContent = resp.text || "";
  if (TR.from === "auto" && resp.src && resp.src !== "auto") TR.detected = resp.src;
  const name = (TR.LANGS.find(([c]) => c === TR.to) || [, TR.to])[1];
  status.textContent = (TR.from === "auto" ? (resp.src || "auto") : TR.from) + " → " + name;
}

function setupTranslate() {
  const input = document.getElementById("trInput");
  const from = document.getElementById("trFrom");
  const to = document.getElementById("trTo");

  input.addEventListener("input", () => {
    clearTimeout(TR.timer);
    TR.timer = setTimeout(runTr, 350);
  });

  from.addEventListener("change", () => { TR.from = from.value; runTr(); });
  to.addEventListener("change", () => {
    TR.to = to.value;
    try { chrome.storage?.local?.set({ translateTo: TR.to }); } catch {}
    runTr();
  });

  document.getElementById("trSwap").addEventListener("click", () => {
    // swap languages and move the translation back into the input.
    // when the source is auto-detect, the new target is the detected language.
    const outText = document.getElementById("trOutput").textContent;
    const prevTo = TR.to;
    TR.to = (TR.from === "auto") ? (TR.detected || "en") : TR.from;
    TR.from = prevTo;
    try { chrome.storage?.local?.set({ translateTo: TR.to }); } catch {}
    fillLangSelect(from, TR.from, true);
    fillLangSelect(to, TR.to, false);
    if (outText) input.value = outText;
    runTr();
  });

  document.getElementById("trCopy").addEventListener("click", () => {
    const t = document.getElementById("trOutput").textContent;
    if (!t) return;
    try { navigator.clipboard.writeText(t); toast("copied"); } catch {}
  });

  document.getElementById("trClose").addEventListener("click", () => openTranslate(false));

  // remember the chosen target language across sessions
  try {
    chrome.storage?.local?.get(["translateTo"], (r) => { if (r && r.translateTo) TR.to = r.translateTo; });
  } catch {}

  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.key.toLowerCase() === "g") { e.preventDefault(); openTranslate(); }
    if (e.key === "Escape" && !document.getElementById("translate").classList.contains("hidden")) openTranslate(false);
  });
}
