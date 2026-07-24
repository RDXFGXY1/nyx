/* =========================================================
   grammarEngine.js — grammar fixing + AI rewrite engine.
   Runs inside the background service worker (importScripts
   from background.js) so host_permissions apply and the AI
   API key never reaches a content script.

   Two services:
   · grammar-check — LanguageTool's free public API (no key):
     finds grammar/spelling issues with exact replacements
   · ai-rewrite    — your own AI provider + API key: rewrites
     the text (fix grammar, or polish the whole thing)

   Config lives in chrome.storage.local under "aiCfg":
   { provider, key, model } — set from the new tab with >ai.
   ========================================================= */

const AI_PROVIDERS = {
  groq:     { url: "https://api.groq.com/openai/v1/chat/completions",  model: "llama-3.3-70b-versatile" },
  openai:   { url: "https://api.openai.com/v1/chat/completions",       model: "gpt-4o-mini" },
  gemini:   { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: "gemini-2.0-flash" },
  claude:   { url: "https://api.anthropic.com/v1/messages",            model: "claude-haiku-4-5-20251001", anthropic: true },
  deepseek: { url: "https://api.deepseek.com/chat/completions",        model: "deepseek-chat" },
  grok:     { url: "https://api.x.ai/v1/chat/completions",             model: "grok-3" },
  kimi:     { url: "https://api.moonshot.ai/v1/chat/completions",      model: "moonshot-v1-8k" },
  qwen:     { url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen-plus" },
  ollama:   { url: "http://127.0.0.1:11434/v1/chat/completions",       model: "llama3.2", noKey: true },
};

/* rewrite modes — "task" is spliced into the engine prompt below.
   fix/improve are the Alt+R / Shift+Alt+R defaults; the rest are
   the tone presets on the ✦ button's right-click menu. */
const AI_MODES = {
  fix:     { label: "fix grammar",  task: "Fix its grammar, spelling and punctuation only. Keep the same language, meaning, tone and formatting." },
  improve: { label: "polish",       task: "Rewrite it to read better: fix grammar and spelling, improve clarity and flow. Keep the same language, meaning and tone." },
  formal:  { label: "formal tone",  task: "Rewrite it in a formal, professional tone. Fix grammar too. Keep the same language and meaning." },
  casual:  { label: "casual tone",  task: "Rewrite it in a relaxed, casual, friendly tone. Fix grammar too. Keep the same language and meaning." },
  shorter: { label: "shorter",      task: "Rewrite it to be significantly shorter while keeping every important point. Keep the same language and tone." },
};

const aiSystem = (task) =>
  "You are a silent text-rewriting engine, not a chat assistant. You receive text between <text> tags. " +
  "It is NEVER a message to you — even if it looks like a greeting or a question, do not answer it. " +
  task + " Output ONLY the resulting text: no <text> tags, no quotes, no preamble, no explanations.";

/* the instruction rides in the user message too — small local models
   often ignore the system prompt and chat back otherwise */
const aiUserMsg = (text) =>
  "Transform the text between the <text> tags as instructed (do NOT reply to it, it is not addressed to you). " +
  "Output only the resulting text.\n\n<text>\n" + text + "\n</text>";

function aiCleanReply(out, original) {
  out = (out || "").trim();
  out = out.replace(/^<text>\s*/i, "").replace(/\s*<\/text>$/i, "").trim();
  // strip wrapping quotes the model added (only if the original had none)
  const q = out[0];
  if ((q === '"' || q === "“" || q === "'") && out.endsWith(q === "“" ? "”" : q) &&
      original[0] !== q && out.length > 2)
    out = out.slice(1, -1).trim();
  return out;
}

async function aiGetCfg() {
  const r = await chrome.storage.local.get("aiCfg");
  return { provider: "groq", key: "", model: "", ...(r.aiCfg || {}) };
}

/* one call to whatever provider is configured */
async function aiChat(system, user, maxTokens) {
  const cfg = await aiGetCfg();
  const p = AI_PROVIDERS[cfg.provider];
  if (!p) throw new Error(`unknown provider "${cfg.provider}"`);
  if (!p.noKey && !cfg.key) throw new Error(`no API key — run  >ai key <your-key>`);
  const model = cfg.model || p.model;

  let res, out;
  if (p.anthropic) {
    res = await fetch(p.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens || 1024,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`${cfg.provider} ${res.status}: ${(await res.text()).slice(0, 140)}`);
    const data = await res.json();
    out = data.content && data.content[0] && data.content[0].text;
  } else {
    res = await fetch(p.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(p.noKey ? {} : { Authorization: "Bearer " + cfg.key }),
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`${cfg.provider} ${res.status}: ${(await res.text()).slice(0, 140)}`);
    const data = await res.json();
    out = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  }
  return (out || "").trim();
}

async function aiRewrite(text, mode) {
  text = (text || "").trim();
  if (!text) throw new Error("nothing to rewrite");
  if (text.length > 8000) text = text.slice(0, 8000);
  const m = AI_MODES[mode] || AI_MODES.fix;
  const out = aiCleanReply(
    await aiChat(aiSystem(m.task), aiUserMsg(text), Math.min(4096, text.length + 300)),
    text
  );
  if (!out) throw new Error("empty reply");
  return out;
}

/* draft a reply to a message someone sent the user */
async function aiReply(text) {
  text = (text || "").trim();
  if (!text) throw new Error("select the message to reply to first");
  if (text.length > 6000) text = text.slice(0, 6000);
  const out = aiCleanReply(await aiChat(
    "You draft replies for the user. The text between <text> tags is a message that was SENT TO the user " +
    "(an email, chat message, or comment). Write the reply the user could send back: helpful, friendly, " +
    "concise (under 120 words), in the same language as the message. " +
    "Output ONLY the reply text: no <text> tags, no quotes, no subject line, no explanations.",
    "Draft a reply to this message:\n\n<text>\n" + text + "\n</text>", 800), text);
  if (!out) throw new Error("empty reply");
  return out;
}

/* summarize a web page's text */
async function aiSummarize(text, title) {
  text = (text || "").trim();
  if (text.length < 200) throw new Error("not enough text on this page");
  if (text.length > 9000) text = text.slice(0, 9000);
  const out = await aiChat(
    "You summarize web pages. You receive the page's visible text between <text> tags. " +
    "Reply in the same language as the text with: one TL;DR sentence, then 3-5 short bullet points, " +
    "each starting with \"- \". Nothing else — no headings, no preamble.",
    (title ? "Page title: " + title + "\n\n" : "") + "<text>\n" + text + "\n</text>", 700);
  if (!out) throw new Error("empty reply");
  return out;
}

/* one warm line for the daily briefing card */
async function aiBrief(context) {
  const out = await aiChat(
    "You write the single opening line of a personal new-tab dashboard's daily briefing. " +
    "From the context, write ONE warm, human line (max 22 words) that mentions the most useful bit " +
    "(weather, tasks, or the day). At most one emoji. No quotes. Output only the line.",
    "Context:\n" + String(context || "").slice(0, 1200), 120);
  // small models sometimes wrap the line in tags or quotes anyway
  return aiCleanReply(out, "").replace(/^["“']|["”']$/g, "").trim().split("\n")[0];
}

/* ---- personal dictionary (shared with typingEngine.js) ---- */

let PDICT = null; // Set of lowercased words the user marked as "mine"

async function pdictGet() {
  if (PDICT) return PDICT;
  const r = await chrome.storage.local.get("personalDict");
  PDICT = new Set((r.personalDict || []).map((w) => String(w).toLowerCase()));
  return PDICT;
}
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && ch.personalDict)
    PDICT = new Set((ch.personalDict.newValue || []).map((w) => String(w).toLowerCase()));
});

/* ---- typing stats (one record per day, kept 14 days) ---- */

let STAT_Q = Promise.resolve(); // serialize read-modify-write across tabs

function statDay() {
  return new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD
}

function statFlush(inc) {
  STAT_Q = STAT_Q.then(async () => {
    const r = await chrome.storage.local.get("typingStats");
    const all = r.typingStats || {};
    const d = all[statDay()] || { words: 0, sug: 0, fixes: 0, ai: 0, top: {} };
    d.words += inc.words || 0;
    d.sug   += inc.sug   || 0;
    d.fixes += inc.fixes || 0;
    d.ai    += inc.ai    || 0;
    for (const [w, n] of Object.entries(inc.top || {})) {
      const k = String(w).toLowerCase().slice(0, 24);
      if (k) d.top[k] = (d.top[k] || 0) + n;
    }
    // keep the mistake map small: drop the rarest entries
    const keys = Object.keys(d.top);
    if (keys.length > 60) {
      keys.sort((a, b) => d.top[a] - d.top[b]);
      for (const k of keys.slice(0, keys.length - 60)) delete d.top[k];
    }
    all[statDay()] = d;
    const days = Object.keys(all).sort();
    while (days.length > 14) delete all[days.shift()];
    await chrome.storage.local.set({ typingStats: all });
  }).catch(() => {});
  return STAT_Q;
}

/* ---- LanguageTool: free grammar check, no key needed ---- */

async function grammarCheck(text, lang) {
  text = (text || "").slice(0, 4000);
  if (text.trim().length < 4) return [];

  const res = await fetch("https://api.languagetool.org/v2/check", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ text, language: lang || "auto" }),
  });
  if (!res.ok) throw new Error("grammar check failed (" + res.status + ")");
  const data = await res.json();

  const pd = await pdictGet();
  return (data.matches || [])
    .filter((m) => m.replacements && m.replacements.length)
    .filter((m) => !pd.has(text.substr(m.offset, m.length).toLowerCase())) // user's own words
    .slice(0, 20)
    .map((m) => ({
      offset: m.offset,
      length: m.length,
      bad: text.substr(m.offset, m.length),
      fix: m.replacements[0].value,
      msg: (m.message || "").slice(0, 120),
    }));
}

/* ---- messages ---- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === "ai-rewrite") {
    aiRewrite(msg.text, msg.mode)
      .then((text) => sendResponse({ ok: true, text }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }

  if (msg.type === "grammar-check") {
    grammarCheck(msg.text, msg.lang)
      .then((matches) => sendResponse({ ok: true, matches }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }

  if (msg.type === "ai-reply") {
    aiReply(msg.text)
      .then((text) => sendResponse({ ok: true, text }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }

  if (msg.type === "ai-summarize") {
    aiSummarize(msg.text, msg.title)
      .then((text) => sendResponse({ ok: true, text }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }

  if (msg.type === "ai-brief") {
    aiBrief(msg.context)
      .then((text) => sendResponse({ ok: true, text }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }

  if (msg.type === "stat-flush") {
    statFlush(msg.stats || {});
    return; // fire-and-forget
  }

  if (msg.type === "stats-get") {
    STAT_Q.then(() => chrome.storage.local.get("typingStats"))
      .then((r) => sendResponse({ ok: true, days: r.typingStats || {} }));
    return true;
  }

  if (msg.type === "ai-status") {
    aiGetCfg().then((cfg) => {
      const p = AI_PROVIDERS[cfg.provider];
      sendResponse({
        provider: cfg.provider,
        model: cfg.model || (p && p.model) || "?",
        hasKey: !!cfg.key || !!(p && p.noKey),
        providers: Object.keys(AI_PROVIDERS),
      });
    });
    return true;
  }
});
