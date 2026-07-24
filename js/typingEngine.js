/* =========================================================
   typingEngine.js — suggestion engine for the typing assistant.
   Runs inside the background service worker (importScripts
   from background.js) so host_permissions apply and the
   dictionary stays in memory across pages.

   Two sources:
   · local  — a per-language frequency word list (thousands of
              words, hermitdave/FrequencyWords on GitHub),
              downloaded once into chrome.storage.local
   · online — Datamuse /sug, fetched on every word (English)

   Answers "typing-*" messages from js/typing.js.
   ========================================================= */

const TYPING_DICT_URL = (lang, size) =>
  `https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/${lang}/${lang}_${size}.txt`;
const TYPING_MAX_WORDS = 50000;

/* in-memory dictionary: words in frequency order + a Set for exact checks */
let TYPING_DICT = { lang: null, words: [], set: null };
const TYPING_CACHE = new Map(); // "mode:lang:word" -> items

// cached suggestions go stale when the personal dictionary changes
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && ch.personalDict) TYPING_CACHE.clear();
});

/* ---- dictionary download & load ---- */

async function typingDownloadDict(lang) {
  lang = (lang || "en").toLowerCase();
  let res = await fetch(TYPING_DICT_URL(lang, "50k"));
  if (!res.ok) res = await fetch(TYPING_DICT_URL(lang, "full"));
  if (!res.ok) throw new Error(`no dictionary found for "${lang}"`);

  const text = await res.text();
  const words = [];
  for (const line of text.split("\n")) {
    const w = line.slice(0, line.indexOf(" ") > 0 ? line.indexOf(" ") : undefined).trim();
    if (w && w.length >= 2 && /^[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*$/u.test(w)) words.push(w);
    if (words.length >= TYPING_MAX_WORDS) break;
  }
  if (words.length < 100) throw new Error(`dictionary for "${lang}" looks empty`);

  await chrome.storage.local.set({ ["typingDict_" + lang]: words.join("\n") });
  TYPING_DICT = { lang, words, set: new Set(words) };
  TYPING_CACHE.clear();
  return words.length;
}

async function typingLoadDict(lang) {
  lang = (lang || "en").toLowerCase();
  if (TYPING_DICT.lang === lang && TYPING_DICT.words.length) return true;
  const r = await chrome.storage.local.get("typingDict_" + lang);
  const raw = r["typingDict_" + lang];
  if (!raw) return false;
  const words = raw.split("\n");
  TYPING_DICT = { lang, words, set: new Set(words) };
  return true;
}

/* ---- local suggestions: prefix completion + spell fix ---- */

function typingEditDist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const c = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      cur.push(c);
      if (c < rowMin) rowMin = c;
    }
    if (rowMin > max) return max + 1; // whole row over budget — abandon
    prev = cur;
  }
  return prev[b.length];
}

function typingSuggestLocal(word, pd) {
  const w = word.toLowerCase();
  const { words, set } = TYPING_DICT;
  const items = [];
  pd = pd || new Set();

  // the user's own words complete first…
  for (const d of pd) {
    if (d.length > w.length && d.startsWith(w)) {
      items.push({ word: d, kind: "sug" });
      if (items.length >= 2) break;
    }
  }
  // …then the frequency dictionary
  for (const d of words) {
    if (d.length > w.length && d.startsWith(w) && !items.some((it) => it.word === d)) {
      items.push({ word: d, kind: "sug" });
      if (items.length >= 5) break;
    }
  }

  // spelling fixes when the word isn't in the dictionary
  // (personal-dictionary words are never treated as mistakes)
  if (w.length >= 4 && !set.has(w) && !pd.has(w) && items.length < 3) {
    const max = w.length >= 7 ? 2 : 1;
    const fixes = [];
    for (let i = 0; i < words.length && fixes.length < 12; i++) {
      const d = words[i];
      if (d === w || Math.abs(d.length - w.length) > max) continue;
      const dist = typingEditDist(w, d, max);
      if (dist <= max) fixes.push({ word: d, kind: "fix", dist });
    }
    fixes.sort((a, b) => a.dist - b.dist); // stable: frequency breaks ties
    for (const f of fixes.slice(0, 4)) {
      if (!items.some((it) => it.word === f.word)) items.push({ word: f.word, kind: "fix" });
    }
  }
  return items.slice(0, 6);
}

/* ---- online suggestions (Datamuse — completions + typo fixes) ---- */

async function typingSuggestOnline(word) {
  const res = await fetch(
    "https://api.datamuse.com/sug?max=6&s=" + encodeURIComponent(word)
  );
  if (!res.ok) throw new Error("suggest failed");
  const data = await res.json();
  const w = word.toLowerCase();
  return (data || [])
    .map((d) => d.word)
    .filter((s) => s && s !== w && !s.includes(" "))
    .slice(0, 6)
    .map((s) => ({ word: s, kind: s.startsWith(w) ? "sug" : "fix" }));
}

/* ---- entry point ---- */

async function typingSuggest(word, mode, lang) {
  word = (word || "").trim();
  if (!word || word.length < 2 || word.length > 32) return { items: [] };

  const key = `${mode}:${lang}:${word.toLowerCase()}`;
  if (TYPING_CACHE.has(key)) return { items: TYPING_CACHE.get(key) };

  // pdictGet lives in grammarEngine.js — both share the worker scope
  const pd = typeof pdictGet === "function" ? await pdictGet() : new Set();

  let items;
  if (mode === "online") {
    items = pd.has(word.toLowerCase()) ? [] : await typingSuggestOnline(word);
  } else {
    if (!(await typingLoadDict(lang))) return { items: [], needDict: true };
    items = typingSuggestLocal(word, pd);
  }

  if (TYPING_CACHE.size > 400) TYPING_CACHE.clear();
  TYPING_CACHE.set(key, items);
  return { items };
}

/* ---- messages from the content script / new tab ---- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === "typing-suggest") {
    typingSuggest(msg.word, msg.mode, msg.lang)
      .then(sendResponse)
      .catch(() => sendResponse({ items: [] }));
    return true;
  }

  if (msg.type === "typing-download") {
    typingDownloadDict(msg.lang)
      .then((count) => sendResponse({ ok: true, count }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }

  if (msg.type === "typing-status") {
    const lang = (msg.lang || "en").toLowerCase();
    chrome.storage.local.get("typingDict_" + lang, (r) => {
      const raw = r["typingDict_" + lang];
      sendResponse({ hasDict: !!raw, words: raw ? raw.split("\n").length : 0 });
    });
    return true;
  }
});
