/* =========================================================
   vault.js — new-tab "Vault mode": the separate, master-password
   gated place to view/manage saved logins. Talks to the local
   backend directly (extension page) with the secret token.
   Open with the key button, Alt+P, or >vault.
   ========================================================= */

const VAULT_API = "http://127.0.0.1:5055/api/vault";

function vaultToken() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get("vaultToken", (r) => {
        if (r && r.vaultToken) return resolve(r.vaultToken);
        const t = (self.crypto?.randomUUID ? crypto.randomUUID() : "") + Date.now().toString(36) + Math.random().toString(36).slice(2);
        chrome.storage.local.set({ vaultToken: t }, () => resolve(t));
      });
    } catch {
      let t = localStorage.getItem("vaultToken");
      if (!t) { t = Date.now().toString(36) + Math.random().toString(36).slice(2); localStorage.setItem("vaultToken", t); }
      resolve(t);
    }
  });
}

async function vaultReq(path, opts = {}) {
  const token = await vaultToken();
  const res = await fetch(VAULT_API + path, {
    ...opts,
    headers: { "X-Vault-Token": token, ...(opts.headers || {}) },
  });
  return res;
}

function openVault(force) {
  const el = document.getElementById("vault");
  const show = force !== undefined ? force : el.classList.contains("hidden");
  el.classList.toggle("hidden", !show);
  document.body.classList.toggle("vault-open", show);
  if (show) refreshVault();
  else stopTotp();
}

async function refreshVault() {
  const body = document.getElementById("vaultBody");
  const lockBtn = document.getElementById("vaultLock");
  lockBtn.style.display = "none";
  let status;
  try {
    status = await (await fetch(VAULT_API + "/status")).json();
  } catch {
    body.innerHTML = `<div class="vault-msg">start the backend (run.bat) to use the vault</div>`;
    return;
  }

  if (!status.setup) return renderSetup();
  if (!status.unlocked) return renderUnlock();
  lockBtn.style.display = "";
  renderList();
}

function renderSetup() {
  document.getElementById("vaultBody").innerHTML = `
    <div class="vault-gate">
      <div class="vg-title">create a master password</div>
      <div class="vg-sub">it encrypts everything. there is no recovery — don't forget it.</div>
      <input type="password" id="vMaster" class="vault-input" placeholder="master password" />
      <input type="password" id="vMaster2" class="vault-input" placeholder="confirm master password" />
      <button id="vSetup" class="vault-btn">create vault</button>
      <div class="vault-err" id="vErr"></div>
    </div>`;
  document.getElementById("vSetup").addEventListener("click", doSetup);
  document.getElementById("vMaster2").addEventListener("keydown", (e) => { if (e.key === "Enter") doSetup(); });
}

async function doSetup() {
  const m = document.getElementById("vMaster").value;
  const m2 = document.getElementById("vMaster2").value;
  const err = document.getElementById("vErr");
  if (m.length < 4) return (err.textContent = "at least 4 characters");
  if (m !== m2) return (err.textContent = "passwords don't match");
  const token = await vaultToken();
  try {
    const res = await fetch(VAULT_API + "/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ master: m, token }),
    });
    if (res.ok) { toast("vault created"); renderList(); document.getElementById("vaultLock").style.display = ""; }
    else err.textContent = "setup failed";
  } catch { err.textContent = "server offline"; }
}

function renderUnlock() {
  document.getElementById("vaultBody").innerHTML = `
    <div class="vault-gate">
      <div class="vg-title">unlock your vault</div>
      <div class="vg-sub">enter your master password</div>
      <input type="password" id="vMaster" class="vault-input" placeholder="master password" autofocus />
      <button id="vUnlock" class="vault-btn">unlock</button>
      <div class="vault-err" id="vErr"></div>
      <button id="vForgot" class="vault-forgot">forgot? reset the vault</button>
    </div>`;
  const go = () => doUnlock();
  document.getElementById("vUnlock").addEventListener("click", go);
  document.getElementById("vMaster").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  document.getElementById("vForgot").addEventListener("click", resetVault);
  document.getElementById("vMaster").focus();
}

async function resetVault() {
  const btn = document.getElementById("vForgot");
  if (!btn.dataset.arm) {
    btn.dataset.arm = "1";
    btn.textContent = "sure? this deletes ALL saved logins — click again";
    btn.classList.add("danger");
    setTimeout(() => { if (btn) { delete btn.dataset.arm; btn.textContent = "forgot? reset the vault"; btn.classList.remove("danger"); } }, 3500);
    return;
  }
  try {
    const r = await vaultReq("/reset", { method: "POST" });
    if (r.ok) { toast("vault reset — set a new master password"); renderSetup(); }
    else toast("could not reset");
  } catch { toast("server offline"); }
}

async function doUnlock() {
  const m = document.getElementById("vMaster").value;
  const err = document.getElementById("vErr");
  try {
    let res = await vaultReq("/unlock", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ master: m }),
    });
    // token lost / mismatched → re-link with the master password, then retry
    if (res.status === 401) {
      const token = await vaultToken();
      const rp = await fetch(VAULT_API + "/reprovision", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ master: m, token }),
      });
      if (rp.ok) res = await vaultReq("/unlock", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ master: m }),
      });
    }
    if (res.ok) { toast("unlocked"); document.getElementById("vaultLock").style.display = ""; renderList(); }
    else err.textContent = "wrong master password";
  } catch { err.textContent = "server offline"; }
}

/* ---- TOTP (2FA) live codes ---- */
function base32Decode(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  s = (s || "").replace(/=+$/, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, val = 0; const out = [];
  for (const c of s) {
    val = (val << 5) | A.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return new Uint8Array(out);
}
async function totpCode(secret, period = 30, digits = 6) {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / period);
  const buf = new ArrayBuffer(8);
  new DataView(buf).setUint32(4, counter);
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, buf));
  const o = sig[19] & 0xf;
  const code = ((sig[o] & 0x7f) << 24) | ((sig[o + 1] & 0xff) << 16) | ((sig[o + 2] & 0xff) << 8) | (sig[o + 3] & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}
const totpRemaining = () => 30 - (Math.floor(Date.now() / 1000) % 30);

const VTOTP = { secrets: {}, timer: null };
function stopTotp() { if (VTOTP.timer) clearInterval(VTOTP.timer); VTOTP.timer = null; VTOTP.secrets = {}; }
async function startTotp(ids) {
  stopTotp();
  for (const id of ids) {
    try { const r = await vaultReq("/totp/" + id); if (r.ok) VTOTP.secrets[id] = (await r.json()).secret; } catch {}
  }
  const tick = async () => {
    const rem = totpRemaining();
    for (const id in VTOTP.secrets) {
      const el = document.getElementById("totp-" + id);
      if (!el) continue;
      const code = await totpCode(VTOTP.secrets[id]);
      el.querySelector(".vt-code").textContent = code.slice(0, 3) + " " + code.slice(3);
      el.querySelector(".vt-ring").style.width = (rem / 30 * 100) + "%";
      el.dataset.code = code;
    }
  };
  await tick();
  VTOTP.timer = setInterval(tick, 1000);
}

/* ---- password health ---- */
async function loadHealth() {
  try {
    const r = await vaultReq("/health");
    if (!r.ok) return;
    const h = await r.json();
    (h.items || []).forEach((it) => {
      const b = document.getElementById("bdg-" + it.id);
      if (b) b.innerHTML = it.issues.map((x) => `<span class="vbadge ${x}">${x}</span>`).join("");
    });
    const el = document.getElementById("vHealth");
    if (el) {
      const parts = [];
      if (h.weak) parts.push(h.weak + " weak");
      if (h.reused) parts.push(h.reused + " reused");
      if (h.old) parts.push(h.old + " old");
      el.textContent = parts.length ? "⚠ " + parts.join(" · ") : "✓ all healthy";
      el.classList.toggle("ok", !parts.length);
    }
  } catch {}
}

const VAULT = { section: "passwords", entries: [], addOpen: false, addOtpOpen: false, addIdOpen: false, addCardOpen: false };

async function renderList() {
  try {
    const r = await vaultReq("/entries");
    if (r.status === 423) return renderUnlock();
    VAULT.entries = (await r.json()).entries || [];
  } catch { document.getElementById("vaultBody").innerHTML = `<div class="vault-msg">server offline</div>`; return; }
  renderSection();
}

function renderSection() {
  stopTotp();
  const body = document.getElementById("vaultBody");
  const n = (k, extra) => VAULT.entries.filter(extra || ((e) => (e.kind || "login") === k)).length;
  const pw = n(null, (e) => e.hasPassword);
  const otp = n(null, (e) => e.hasTotp);
  const idn = n("identity");
  const card = n("card");
  body.innerHTML = `
    <div class="vsec-tabs">
      <button class="vsec ${VAULT.section === "passwords" ? "on" : ""}" data-sec="passwords">passwords <span class="vsec-n">${pw}</span></button>
      <button class="vsec ${VAULT.section === "auth" ? "on" : ""}" data-sec="auth">2FA <span class="vsec-n">${otp}</span></button>
      <button class="vsec ${VAULT.section === "identity" ? "on" : ""}" data-sec="identity">identity <span class="vsec-n">${idn}</span></button>
      <button class="vsec ${VAULT.section === "cards" ? "on" : ""}" data-sec="cards">cards <span class="vsec-n">${card}</span></button>
    </div>
    <div id="vSecBody"></div>`;
  body.querySelectorAll(".vsec").forEach((b) =>
    b.addEventListener("click", () => { VAULT.section = b.dataset.sec; renderSection(); }));
  if (VAULT.section === "passwords") renderPasswords();
  else if (VAULT.section === "auth") renderAuth();
  else if (VAULT.section === "identity") renderIdentity();
  else renderCards();
}

/* ---- identities ---- */
function renderIdentity() {
  const el = document.getElementById("vSecBody");
  const list = VAULT.entries.filter((e) => e.kind === "identity");
  const rows = list.length ? list.map((e) => `
    <div class="ventry" data-id="${e.id}">
      <div class="ve-ico">${escHtml((e.site[0] || "?").toUpperCase())}</div>
      <div class="ve-body">
        <div class="ve-site">${escHtml(e.fields.fullName || e.site)}</div>
        <div class="ve-user">${escHtml(e.fields.email || "identity")}</div>
      </div>
      <div class="ve-actions"><button class="ve-del" data-id="${e.id}" title="delete">✕</button></div>
    </div>`).join("") : `<div class="vault-msg">no identity saved — add one to autofill signup & checkout forms</div>`;
  el.innerHTML = `
    <div class="vault-topbar"><button id="vAddIdToggle" class="vault-mini">＋ add identity</button></div>
    <div class="vault-add col ${VAULT.addIdOpen ? "" : "hidden"}" id="vAddIdForm">
      <input id="idFull" class="vault-input sm" placeholder="full name" />
      <input id="idEmail" class="vault-input sm" placeholder="email" />
      <input id="idPhone" class="vault-input sm" placeholder="phone" />
      <input id="idAddr" class="vault-input sm" placeholder="street address" />
      <input id="idCity" class="vault-input sm" placeholder="city" />
      <input id="idZip" class="vault-input sm" placeholder="postal code" />
      <input id="idCountry" class="vault-input sm" placeholder="country" />
      <button id="idAdd" class="vault-btn sm">save identity</button>
    </div>
    <div class="vault-scroll"><div class="vault-list">${rows}</div></div>`;
  document.getElementById("vAddIdToggle").addEventListener("click", () => { VAULT.addIdOpen = !VAULT.addIdOpen; renderIdentity(); });
  const a = document.getElementById("idAdd");
  if (a) a.addEventListener("click", addIdentity);
  el.querySelectorAll(".ve-del").forEach((b) => b.addEventListener("click", () => delEntry(b.dataset.id)));
}

async function addIdentity() {
  const g = (id) => document.getElementById(id).value.trim();
  const fields = { fullName: g("idFull"), email: g("idEmail"), phone: g("idPhone"),
    address: g("idAddr"), city: g("idCity"), zip: g("idZip"), country: g("idCountry") };
  if (!fields.fullName && !fields.email) return toast("add at least a name or email");
  try {
    const r = await vaultReq("/entries", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "identity", site: fields.fullName || "identity", fields }) });
    if (r.ok) { toast("identity saved"); VAULT.addIdOpen = false; renderList(); } else toast("could not save");
  } catch { toast("server offline"); }
}

/* ---- cards (CVV never stored) ---- */
function renderCards() {
  const el = document.getElementById("vSecBody");
  const list = VAULT.entries.filter((e) => e.kind === "card");
  const rows = list.length ? list.map((e) => `
    <div class="ventry" data-id="${e.id}">
      <div class="ve-ico">💳</div>
      <div class="ve-body">
        <div class="ve-site">${escHtml(e.fields.brand || e.site)} <span class="ve-cardno" id="cn-${e.id}">•••• ${escHtml(e.fields.last4 || "")}</span></div>
        <div class="ve-user">${escHtml(e.fields.cardholder || "")}${e.fields.expiry ? " · " + escHtml(e.fields.expiry) : ""}</div>
      </div>
      <div class="ve-actions">
        <button class="ve-reveal" data-id="${e.id}" title="show / copy number">👁</button>
        <button class="ve-del" data-id="${e.id}" title="delete">✕</button>
      </div>
    </div>`).join("") : `<div class="vault-msg">no cards saved — CVV is never stored, you type it each time</div>`;
  el.innerHTML = `
    <div class="vault-topbar"><button id="vAddCardToggle" class="vault-mini">＋ add card</button></div>
    <div class="vault-add col ${VAULT.addCardOpen ? "" : "hidden"}" id="vAddCardForm">
      <input id="cdName" class="vault-input sm" placeholder="cardholder name" />
      <input id="cdNum" class="vault-input sm" placeholder="card number" inputmode="numeric" />
      <input id="cdExp" class="vault-input sm" placeholder="expiry MM/YY" />
      <input id="cdBrand" class="vault-input sm" placeholder="brand (Visa, Mastercard…)" />
      <div class="vault-note">🔒 we never store your CVV — you'll type it yourself at checkout.</div>
      <button id="cdAdd" class="vault-btn sm">save card</button>
    </div>
    <div class="vault-scroll"><div class="vault-list">${rows}</div></div>`;
  document.getElementById("vAddCardToggle").addEventListener("click", () => { VAULT.addCardOpen = !VAULT.addCardOpen; renderCards(); });
  const a = document.getElementById("cdAdd");
  if (a) a.addEventListener("click", addCard);
  el.querySelectorAll(".ve-reveal").forEach((b) => b.addEventListener("click", () => revealCard(b.dataset.id)));
  el.querySelectorAll(".ve-del").forEach((b) => b.addEventListener("click", () => delEntry(b.dataset.id)));
}

async function addCard() {
  const g = (id) => document.getElementById(id).value.trim();
  const number = g("cdNum").replace(/\s/g, "");
  if (!/^\d{12,19}$/.test(number)) return toast("enter a valid card number");
  const brand = g("cdBrand") || (number[0] === "4" ? "Visa" : number[0] === "5" ? "Mastercard" : "Card");
  const fields = { cardholder: g("cdName"), number, expiry: g("cdExp"), brand };
  try {
    const r = await vaultReq("/entries", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "card", site: brand, fields }) });
    if (r.ok) { toast("card saved (CVV not stored)"); VAULT.addCardOpen = false; renderList(); } else toast("could not save");
  } catch { toast("server offline"); }
}

async function revealCard(id) {
  const el = document.getElementById("cn-" + id);
  if (el.dataset.shown) { const last4 = el.textContent.slice(-4); el.textContent = "•••• " + last4; delete el.dataset.shown; return; }
  try {
    const r = await vaultReq("/detail/" + id);
    if (!r.ok) return;
    const num = (await r.json()).fields.number || "";
    el.textContent = num.replace(/(.{4})/g, "$1 ").trim();
    el.dataset.shown = "1";
    try { await navigator.clipboard.writeText(num); toast("card number copied"); } catch {}
  } catch {}
}

function passwordRow(e) {
  return `
    <div class="ventry" data-id="${e.id}">
      <div class="ve-ico">${escHtml((e.site[0] || "?").toUpperCase())}</div>
      <div class="ve-body">
        <div class="ve-site">${escHtml(e.site)} <span class="ve-badges" id="bdg-${e.id}"></span></div>
        <div class="ve-user">${escHtml(e.username || "—")}</div>
      </div>
      <div class="ve-pw" id="pw-${e.id}">••••••••</div>
      <div class="ve-actions">
        <button class="ve-reveal" data-id="${e.id}" title="show / copy">👁</button>
        <button class="ve-del" data-id="${e.id}" title="delete">✕</button>
      </div>
    </div>`;
}

function renderPasswords() {
  const el = document.getElementById("vSecBody");
  const list = VAULT.entries.filter((e) => e.hasPassword);
  const rows = list.length ? list.map(passwordRow).join("")
    : `<div class="vault-msg">no logins yet — hit “＋ add login”, or log in somewhere and let the browser offer to save</div>`;
  el.innerHTML = `
    <div class="vault-topbar">
      <button id="vAddToggle" class="vault-mini">＋ add login</button>
      <span class="vt-health" id="vHealth"></span>
      <button id="vImport" class="vault-ghostbtn">import CSV</button>
    </div>
    <div class="vault-add ${VAULT.addOpen ? "" : "hidden"}" id="vAddForm">
      <input id="vaSite" class="vault-input sm" placeholder="site (e.g. GitHub)" />
      <input id="vaUser" class="vault-input sm" placeholder="username / email" />
      <input id="vaPass" type="password" class="vault-input sm" placeholder="password" />
      <input id="vaUrl" class="vault-input sm" placeholder="url (optional)" />
      <button id="vaAdd" class="vault-btn sm">save login</button>
    </div>
    <div class="vault-scroll"><div class="vault-list">${rows}</div></div>`;

  document.getElementById("vAddToggle").addEventListener("click", () => {
    VAULT.addOpen = !VAULT.addOpen; renderPasswords();
    if (VAULT.addOpen) document.getElementById("vaSite").focus();
  });
  document.getElementById("vImport").addEventListener("click", importCSV);
  const add = document.getElementById("vaAdd");
  if (add) add.addEventListener("click", addEntry);
  el.querySelectorAll(".ve-reveal").forEach((b) => b.addEventListener("click", () => revealPw(b.dataset.id)));
  el.querySelectorAll(".ve-del").forEach((b) => b.addEventListener("click", () => delEntry(b.dataset.id)));
  loadHealth();
}

function otpRow(e) {
  return `
    <div class="ventry" data-id="${e.id}">
      <div class="ve-ico">${escHtml((e.site[0] || "?").toUpperCase())}</div>
      <div class="ve-body">
        <div class="ve-site">${escHtml(e.site)}</div>
        <div class="ve-user">tap code to copy</div>
      </div>
      <div class="ve-totp" id="totp-${e.id}" title="2FA code — click to copy"><span class="vt-code">------</span><span class="vt-bar"><i class="vt-ring"></i></span></div>
      <div class="ve-actions"><button class="ve-del" data-id="${e.id}" title="delete">✕</button></div>
    </div>`;
}

function renderAuth() {
  const el = document.getElementById("vSecBody");
  const list = VAULT.entries.filter((e) => e.hasTotp);
  const rows = list.length ? list.map(otpRow).join("")
    : `<div class="vault-msg">no 2FA codes yet — add one and watch the live code tick</div>`;
  el.innerHTML = `
    <div class="vault-topbar">
      <button id="vAddOtpToggle" class="vault-mini">＋ add 2FA code</button>
    </div>
    <div class="vault-add ${VAULT.addOtpOpen ? "" : "hidden"}" id="vAddOtpForm">
      <input id="voName" class="vault-input sm" placeholder="name (e.g. GitHub)" />
      <input id="voSecret" class="vault-input sm" placeholder="2FA secret key (base32)" />
      <button id="voAdd" class="vault-btn sm">add code</button>
    </div>
    <div class="vault-scroll"><div class="vault-list">${rows}</div></div>`;

  document.getElementById("vAddOtpToggle").addEventListener("click", () => {
    VAULT.addOtpOpen = !VAULT.addOtpOpen; renderAuth();
    if (VAULT.addOtpOpen) document.getElementById("voName").focus();
  });
  const voAdd = document.getElementById("voAdd");
  if (voAdd) voAdd.addEventListener("click", addOtp);
  el.querySelectorAll(".ve-del").forEach((b) => b.addEventListener("click", () => delEntry(b.dataset.id)));
  el.querySelectorAll(".ve-totp").forEach((t) =>
    t.addEventListener("click", () => {
      if (t.dataset.code) navigator.clipboard.writeText(t.dataset.code).then(() => toast("2FA code copied")).catch(() => {});
    }));
  startTotp(list.map((e) => e.id));
}

async function addOtp() {
  let name = document.getElementById("voName").value.trim();
  let raw = document.getElementById("voSecret").value.trim();

  // accept a full otpauth:// link (from "can't scan the QR?") and pull the secret + name
  if (/^otpauth:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const s = u.searchParams.get("secret");
      if (s) raw = s;
      const issuer = u.searchParams.get("issuer");
      const label = decodeURIComponent((u.pathname || "").replace(/^\/+/, "").replace(/^totp\//i, ""));
      if (!name) name = issuer || (label.includes(":") ? label.split(":")[0] : label) || "2FA";
    } catch {}
  }
  const secret = raw.replace(/\s/g, "");
  if (!secret) return toast("paste the 2FA secret or otpauth:// link");
  try { if (!base32Decode(secret).length) return toast("that secret looks invalid"); }
  catch { return toast("that secret looks invalid"); }
  try {
    const r = await vaultReq("/entries", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: name || "2FA", totp: secret }),
    });
    if (r.ok) { toast("2FA code added"); VAULT.addOtpOpen = false; renderList(); } else toast("could not add");
  } catch { toast("server offline"); }
}

/* CSV parser — handles quoted fields with commas / newlines inside */
function parseCSV(text) {
  const rows = [];
  let cur = [], field = "", inq = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inq) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inq = false; }
      else field += c;
    } else if (c === '"') inq = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(field); rows.push(cur); cur = []; field = "";
    } else field += c;
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((x) => x && x.trim()));
}

/* map CSV rows → vault entries (Chrome/Brave/Bitwarden-ish columns) */
function csvToEntries(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = head.some((h) => /password|url|username|login|name/.test(h));
  let start = 0, idx = { name: 0, url: 1, username: 2, password: 3 };
  if (hasHeader) {
    start = 1;
    const find = (...keys) => { for (const k of keys) { const i = head.indexOf(k); if (i >= 0) return i; } return -1; };
    idx = {
      name: find("name", "title"),
      url: find("url", "website", "login_uri", "uri"),
      username: find("username", "login", "email", "user"),
      password: find("password", "pass"),
    };
  }
  const out = [];
  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    const pass = idx.password >= 0 ? (row[idx.password] || "").trim() : "";
    if (!pass) continue;
    const url = idx.url >= 0 ? (row[idx.url] || "").trim() : "";
    let host = "";
    try { host = url ? new URL(url).hostname.replace(/^www\./, "") : ""; } catch {}
    out.push({
      site: (idx.name >= 0 && row[idx.name]) ? row[idx.name].trim() : (host || "login"),
      host, url,
      username: idx.username >= 0 ? (row[idx.username] || "").trim() : "",
      password: pass,
    });
  }
  return out;
}

function importCSV() {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = ".csv,text/csv";
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    let entries;
    try { entries = csvToEntries(await f.text()); }
    catch { return toast("could not read that file"); }
    if (!entries.length) return toast("no logins found — is it a password CSV?");
    try {
      const r = await vaultReq("/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entries),
      });
      if (r.status === 423) return renderUnlock();
      if (!r.ok) return toast("import failed");
      const d = await r.json();
      toast("imported " + (d.count || 0) + " logins");
      renderList();
    } catch { toast("server offline"); }
  };
  inp.click();
}

async function revealPw(id) {
  const el = document.getElementById("pw-" + id);
  if (el.dataset.shown) { el.textContent = "••••••••"; delete el.dataset.shown; return; }
  try {
    const r = await vaultReq("/reveal/" + id);
    if (!r.ok) return;
    const pw = (await r.json()).password || "";
    el.textContent = pw;
    el.dataset.shown = "1";
    try { await navigator.clipboard.writeText(pw); toast("password copied"); } catch {}
  } catch {}
}

async function delEntry(id) {
  try { await vaultReq("/entries/" + id, { method: "DELETE" }); renderList(); toast("login removed"); }
  catch {}
}

async function addEntry() {
  const site = document.getElementById("vaSite").value.trim();
  const username = document.getElementById("vaUser").value.trim();
  const password = document.getElementById("vaPass").value;
  let url = document.getElementById("vaUrl").value.trim();
  if (!password) return toast("password required");
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
  let host = "";
  try { host = url ? new URL(url).hostname : ""; } catch {}
  try {
    const r = await vaultReq("/entries", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: site || host || "login", host, username, password, url }),
    });
    if (r.ok) { toast("login saved"); renderList(); } else toast("could not save");
  } catch { toast("server offline"); }
}

async function lockVault() {
  stopTotp();
  try { await vaultReq("/lock", { method: "POST" }); } catch {}
  toast("vault locked");
  renderUnlock();
  document.getElementById("vaultLock").style.display = "none";
}

function setupVault() {
  document.getElementById("vaultOpenBtn").addEventListener("click", () => openVault());
  document.getElementById("vaultClose").addEventListener("click", () => openVault(false));
  document.getElementById("vaultLock").addEventListener("click", lockVault);
  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.key.toLowerCase() === "p") { e.preventDefault(); openVault(); }
    if (e.key === "Escape") openVault(false);
  });
}
