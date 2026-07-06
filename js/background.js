/* =========================================================
   background.js — service worker.
   Right-click anywhere (Discord, any site) → "Save to Stash".
   Opens a little popup window pre-filled with the text/link,
   where you pick tags and save. Data lives in chrome.storage
   so the new-tab Stash board sees it instantly.
   ========================================================= */

const RPC_ENDPOINTS = [
  "http://127.0.0.1:5055/api/rpc/activity",
  "http://localhost:5055/api/rpc/activity"
];
let rpcTimer = null;

function buildMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "stash-selection",
      title: 'Save "%s" to Stash',
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "stash-link",
      title: "Save link to Stash",
      contexts: ["link"],
    });
    chrome.contextMenus.create({
      id: "stash-image",
      title: "Save image to Stash",
      contexts: ["image"],
    });
    chrome.contextMenus.create({
      id: "stash-page",
      title: "Save this page to Stash",
      contexts: ["page"],
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  buildMenus();
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) scheduleRpcUpdate(tabs[0]);
  });
});
chrome.runtime.onStartup.addListener(() => {
  buildMenus();
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) scheduleRpcUpdate(tabs[0]);
  });
});

function openSavePopup(name, url) {
  const params = new URLSearchParams({ name: name || "", url: url || "" });
  chrome.windows.create({
    url: chrome.runtime.getURL("save.html") + "?" + params.toString(),
    type: "popup",
    width: 400,
    height: 480,
    focused: true,
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const sel = (info.selectionText || "").trim();
  const url = info.linkUrl || info.srcUrl || info.pageUrl || (tab && tab.url) || "";
  const name = sel || (tab && tab.title) || url;
  openSavePopup(name, url);
});

function normalizeText(value, fallback) {
  const text = (value || "").toString().trim();
  return text || fallback;
}

function buildActivityForTab(tab) {
  const url = normalizeText(tab?.url, "");
  const title = normalizeText(tab?.title, "");

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname || "/";

    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      const label = title || "YouTube";
      return {
        state: "Watching",
        details: label.length > 80 ? label.slice(0, 77) + "..." : label,
        largeImageKey: "youtube",
        largeImageText: "YouTube",
        smallImageKey: "play",
        smallImageText: "Watching"
      };
    }

    if (host.includes("github.com")) {
      const parts = path.split("/").filter(Boolean);
      const repo = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
      return {
        state: "Browsing GitHub",
        details: repo ? `Repo: ${repo}` : "GitHub",
        largeImageKey: "github",
        largeImageText: "GitHub",
        smallImageKey: "code",
        smallImageText: "Coding",
        buttonLabel: "View GitHub",
        buttonUrl: "https://github.com/RDXFGXY1"
      };
    }

    const siteName = host || "the web";
    const details = title || siteName;
    return {
      state: `Browsing ${siteName}`,
      details: details.length > 80 ? details.slice(0, 77) + "..." : details,
      largeImageKey: "browser",
      largeImageText: "Browser",
      smallImageKey: "browser",
      smallImageText: "Browsing"
    };
  } catch {
    return {
      state: "Browsing the web",
      details: title || "Browser tab",
      largeImageKey: "browser",
      largeImageText: "Browser"
    };
  }
}

async function pushRpcActivity(tab) {
  if (!tab || !tab.url) return;
  const activity = buildActivityForTab(tab);

  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activity)
      });

      if (response.ok) return;
      console.warn("Discord RPC endpoint returned an error", endpoint, response.status);
    } catch (error) {
      console.warn("Discord RPC update failed", endpoint, error);
    }
  }
}

function scheduleRpcUpdate(tab) {
  if (rpcTimer) clearTimeout(rpcTimer);
  rpcTimer = setTimeout(() => pushRpcActivity(tab), 250);
  pushAutoDj(tab);
}

/* Auto-DJ: tell the new-tab player what kind of page is active */
function autodjContext(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (/github\.com|github\.dev|gitlab\.com|stackoverflow\.com|stackexchange\.com|developer\.mozilla\.org|vscode\.dev|codepen\.io|replit\.com|leetcode\.com/.test(h)) return "code";
    if (/youtube\.com|youtu\.be|netflix\.com|twitch\.tv|primevideo|hulu|disneyplus|vimeo\.com/.test(h)) return "video";
    return "other";
  } catch { return "other"; }
}
function pushAutoDj(tab) {
  if (!tab || !tab.url) return;
  try { chrome.runtime.sendMessage({ type: "autodj", context: autodjContext(tab.url) }).catch(() => {}); } catch {}
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (tab) scheduleRpcUpdate(tab);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    scheduleRpcUpdate(tab);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== -1) {
    chrome.tabs.query({ active: true, windowId }, (tabs) => {
      if (tabs[0]) scheduleRpcUpdate(tabs[0]);
    });
  }
});

/* =========================================================
   Password vault relay — the content script has no token and
   is subject to CORS, so it talks to the vault THROUGH us.
   The token lives in chrome.storage (web pages can't read it).
   ========================================================= */
const VAULT_BASE = "http://127.0.0.1:5055/api/vault";
let pendingSave = null; // creds captured on submit, shown after navigation

function getVaultToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get("vaultToken", (r) => {
      if (r.vaultToken) return resolve(r.vaultToken);
      const t = (self.crypto?.randomUUID ? crypto.randomUUID() : "")
        + Date.now().toString(36) + Math.random().toString(36).slice(2);
      chrome.storage.local.set({ vaultToken: t }, () => resolve(t));
    });
  });
}

async function vaultFetch(path, opts = {}) {
  const token = await getVaultToken();
  return fetch(VAULT_BASE + path, {
    ...opts,
    headers: { "X-Vault-Token": token, ...(opts.headers || {}) },
  });
}

/* the in-page hover bubble + vault content script talk to us */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "stash-save") {
    openSavePopup(msg.name, msg.url);
    return;
  }

  if (msg && msg.type === "rpc-page") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || !sender.tab || sender.tab.id !== activeTab.id) return;
      scheduleRpcUpdate({ ...activeTab, title: msg.title || activeTab.title, url: msg.url || activeTab.url });
    });
    return;
  }

  if (msg && msg.type === "vault-match") {
    vaultFetch("/match?host=" + encodeURIComponent(msg.host))
      .then((r) => (r.ok ? r.json() : { matches: [] }))
      .then((d) => sendResponse(d))
      .catch(() => sendResponse({ matches: [] }));
    return true;
  }

  if (msg && msg.type === "vault-open") {
    chrome.tabs.create({ active: true });
    return;
  }

  if (msg && msg.type === "vault-otpcodes") {
    vaultFetch("/otpcodes")
      .then((r) => (r.ok ? r.json() : { codes: [] }))
      .then((d) => sendResponse(d)).catch(() => sendResponse({ codes: [] }));
    return true;
  }

  if (msg && msg.type === "vault-identity") {
    (async () => {
      try {
        const r = await vaultFetch("/entries");
        if (!r.ok) return sendResponse({ identity: null });
        const ents = (await r.json()).entries || [];
        const id = ents.find((e) => e.kind === "identity");
        if (!id) return sendResponse({ identity: null });
        const d = await vaultFetch("/detail/" + id.id);
        sendResponse({ identity: d.ok ? (await d.json()).fields : null });
      } catch { sendResponse({ identity: null }); }
    })();
    return true;
  }

  if (msg && msg.type === "vault-cards") {
    vaultFetch("/entries")
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((d) => sendResponse({
        cards: (d.entries || []).filter((e) => e.kind === "card")
          .map((e) => ({ id: e.id, brand: e.fields.brand, last4: e.fields.last4, cardholder: e.fields.cardholder, expiry: e.fields.expiry })),
      }))
      .catch(() => sendResponse({ cards: [] }));
    return true;
  }

  if (msg && msg.type === "vault-carddetail") {
    vaultFetch("/detail/" + msg.id)
      .then((r) => (r.ok ? r.json() : { fields: {} }))
      .then((d) => sendResponse(d)).catch(() => sendResponse({ fields: {} }));
    return true;
  }

  if (msg && msg.type === "vault-save") {
    vaultFetch("/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.entry),
    })
      .then((r) => sendResponse({ ok: r.ok, status: r.status }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  // creds captured on submit — hold them so the bubble can show after nav
  if (msg && msg.type === "vault-pending") {
    pendingSave = { ...msg.entry, at: Date.now() };
    return;
  }
  if (msg && msg.type === "vault-pending-get") {
    const p = pendingSave && Date.now() - pendingSave.at < 60000 ? pendingSave : null;
    sendResponse({ pending: p });
    return;
  }
  if (msg && msg.type === "vault-pending-clear") {
    pendingSave = null;
    return;
  }
});
