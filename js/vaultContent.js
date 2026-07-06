/* =========================================================
   vaultContent.js — runs on every page.
   - Autofill: focus a login field → offer saved logins for this site.
   - Save: submit a form with a password → offer to save it (the offer
     survives the page navigation via the background "pending" store).
   Talks to the vault only through the background worker (which holds
   the secret token), never straight to the server.
   ========================================================= */

(() => {
  if (window.__vaultLoaded) return;
  window.__vaultLoaded = true;

  const FONT = "-apple-system,'Segoe UI',Roboto,sans-serif";
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
  let menu = null, bubble = null;

  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4; };

  function passwordField() {
    return [...document.querySelectorAll('input[type="password"]')].find(visible) || null;
  }

  function userFieldNear(pw) {
    const scope = pw ? (pw.closest("form") || document) : document;
    const inputs = [...scope.querySelectorAll("input")].filter(visible);
    if (pw) {
      const idx = inputs.indexOf(pw);
      for (let i = idx - 1; i >= 0; i--) {
        const el = inputs[i];
        const hay = (el.type + " " + el.name + " " + el.id + " " + (el.autocomplete || "")).toLowerCase();
        if (el.type === "email" || el.type === "text" || /user|email|login|name/.test(hay)) return el;
      }
    }
    return scope.querySelector('input[type="email"], input[type="text"]');
  }

  function setValue(el, val) {
    if (!el) return;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter ? setter.call(el, val) : (el.value = val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function closeMenu() { if (menu) { menu.remove(); menu = null; } }

  // ---- strong password generator ----
  function genPassword(len) {
    const U = "ABCDEFGHJKMNPQRSTUVWXYZ", L = "abcdefghijkmnpqrstuvwxyz", D = "23456789", S = "!@#$%^&*-_=+?";
    const all = U + L + D + S;
    const rnd = new Uint32Array(len);
    crypto.getRandomValues(rnd);
    const chars = [U[rnd[0] % U.length], L[rnd[1] % L.length], D[rnd[2] % D.length], S[rnd[3] % S.length]];
    for (let i = 4; i < len; i++) chars.push(all[rnd[i] % all.length]);
    const sh = new Uint32Array(chars.length);
    crypto.getRandomValues(sh);
    for (let i = chars.length - 1; i > 0; i--) { const j = sh[i] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    return chars.join("");
  }

  function isNewPasswordField(pw) {
    if (!pw) return false;
    if ((pw.autocomplete || "").toLowerCase() === "new-password") return true;
    const form = pw.closest ? (pw.closest("form") || document) : document;
    if ([...form.querySelectorAll('input[type="password"]')].filter(visible).length >= 2) return true;
    const hay = ((pw.name || "") + " " + (pw.id || "") + " " + (form.id || "") + " " + (form.className || "")).toLowerCase();
    return /new|confirm|regist|sign.?up|create/.test(hay);
  }

  function fillGenerated(pw) {
    const active = document.activeElement;
    const form = active && active.closest && active.closest("form");
    let targets = [...document.querySelectorAll('input[type="password"]')].filter(visible);
    if (form) { const f = [...form.querySelectorAll('input[type="password"]')].filter(visible); if (f.length) targets = f; }
    targets.forEach((el) => setValue(el, pw));
  }

  function flashNote(text) {
    const n = document.createElement("div");
    n.textContent = text;
    n.style.cssText =
      "all:initial;position:fixed;z-index:2147483647;left:50%;bottom:26px;transform:translateX(-50%);" +
      "font-family:" + FONT + ";font-size:12px;color:#f4f4f6;background:rgba(20,20,26,0.96);" +
      "border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:9px 18px;box-shadow:0 10px 30px rgba(0,0,0,0.4);";
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 2000);
  }

  // ---- menu ----
  function menuShell(anchor) {
    closeMenu();
    const r = anchor.getBoundingClientRect();
    menu = document.createElement("div");
    menu.style.cssText =
      "all:initial;position:fixed;z-index:2147483647;font-family:" + FONT + ";" +
      "left:" + Math.max(8, r.left) + "px;top:" + (r.bottom + 6) + "px;width:" + Math.max(230, r.width) + "px;";
    const box = document.createElement("div");
    box.style.cssText =
      "box-sizing:border-box;background:rgba(18,18,24,0.98);border:1px solid rgba(255,255,255,0.14);" +
      "border-radius:12px;overflow:hidden;box-shadow:0 14px 40px rgba(0,0,0,0.5);";
    menu.appendChild(box);
    return box;
  }

  function rowEl(inner) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:9px;padding:10px 12px;cursor:pointer;color:#f4f4f6;font-size:13px;";
    row.innerHTML = inner;
    row.addEventListener("mouseenter", () => (row.style.background = "rgba(255,255,255,0.06)"));
    row.addEventListener("mouseleave", () => (row.style.background = "transparent"));
    return row;
  }

  const badge = (emoji, size) =>
    "<span style='width:22px;height:22px;border-radius:6px;background:" + ACCENT_SOFT + ";color:" + ACCENT +
    ";display:grid;place-items:center;font-size:" + (size || 11) + "px;flex:none'>" + emoji + "</span>";

  function fillRow(m) {
    const row = rowEl(badge("🔑") +
      "<span style='flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'>" +
      (m.username || m.site || "saved login") + "</span><span style='font-size:11px;color:" + ACCENT + "'>fill</span>");
    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pw = passwordField();
      setValue(userFieldNear(pw), m.username);
      setValue(pw, m.password);
      closeMenu();
    });
    return row;
  }

  function genRowEl() {
    const row = rowEl(badge("✨", 12) + "<span style='flex:1'>Suggest strong password</span>");
    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pw = genPassword(18);
      fillGenerated(pw);
      try { navigator.clipboard.writeText(pw); } catch {}
      closeMenu();
      flashNote("✨ strong password filled & copied");
    });
    return row;
  }

  function lockedRowEl() {
    const row = rowEl("<span style='color:" + ACCENT + "'>🔒</span><span style='flex:1'>Unlock vault to autofill</span><span style='font-size:11px;color:" + ACCENT + "'>open</span>");
    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      try { chrome.runtime.sendMessage({ type: "vault-open" }); } catch {}
      closeMenu();
    });
    return row;
  }

  function requestFill(anchor) {
    const generate = isNewPasswordField(passwordField());
    try {
      chrome.runtime.sendMessage({ type: "vault-match", host: location.hostname }, (res) => {
        if (chrome.runtime.lastError) return;
        const matches = (res && res.matches) || [];
        const locked = !!(res && res.locked);
        if (!matches.length && !locked && !generate) return closeMenu();
        const box = menuShell(anchor);
        matches.forEach((m) => box.appendChild(fillRow(m)));
        if (locked && !matches.length) box.appendChild(lockedRowEl());
        if (generate || matches.length) box.appendChild(genRowEl());
        document.body.appendChild(menu);
      });
    } catch { /* extension context gone */ }
  }

  // ---- field-kind detection for 2FA / identity / card autofill ----
  const attrHay = (el) => ((el.name || "") + " " + (el.id || "") + " " + (el.autocomplete || "") +
    " " + (el.placeholder || "") + " " + (el.getAttribute("aria-label") || "")).toLowerCase();

  function isOtpField(el) {
    if (el.type === "password") return false;
    if ((el.autocomplete || "").toLowerCase() === "one-time-code") return true;
    const h = attrHay(el);
    // strong keywords — enough on their own (covers Discord's "authentication code")
    if (/one.?time|(^|[^a-z])otp([^a-z]|$)|2fa|mfa|two.?factor|authenticat|verif\w*|security.?code|auth.?code|backup.?code|6.?digit/.test(h)) return true;
    // generic short numeric code box
    const ml = el.maxLength;
    if ((el.inputMode === "numeric" || el.type === "tel") && ml >= 4 && ml <= 8) return true;
    return false;
  }
  function isCardNumberField(el) {
    if ((el.autocomplete || "").toLowerCase().includes("cc-number")) return true;
    return /card.?number|cardnum|ccnum|credit.?card/.test(attrHay(el));
  }
  function isIdentityField(el) {
    const ac = (el.autocomplete || "").toLowerCase();
    if (/name|email|tel|street|address|postal|country|given|family/.test(ac)) return true;
    return /full.?name|first.?name|last.?name|e-?mail|phone|mobile|street|(^|[^a-z])city|zip|postal|country/.test(attrHay(el));
  }

  function showLockedMenu(anchor) { const box = menuShell(anchor); box.appendChild(lockedRowEl()); document.body.appendChild(menu); }

  function offerOtp(anchor) {
    try {
      chrome.runtime.sendMessage({ type: "vault-otpcodes" }, (res) => {
        if (chrome.runtime.lastError) return;
        const codes = (res && res.codes) || [];
        if (!codes.length) { if (res && res.locked) showLockedMenu(anchor); return; }
        const box = menuShell(anchor);
        codes.forEach((c) => {
          const row = rowEl(badge("🔑") + "<span style='flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'>" +
            (c.site || "2FA") + "</span><span style='font-family:monospace;font-weight:700;color:" + ACCENT + "'>" + c.code + "</span>");
          row.addEventListener("mousedown", (e) => { e.preventDefault(); setValue(anchor, c.code); closeMenu(); });
          box.appendChild(row);
        });
        document.body.appendChild(menu);
      });
    } catch {}
  }

  function offerIdentity(anchor) {
    try {
      chrome.runtime.sendMessage({ type: "vault-identity" }, (res) => {
        if (chrome.runtime.lastError) return;
        const idf = res && res.identity;
        if (!idf) return;
        const box = menuShell(anchor);
        const row = rowEl(badge("👤") + "<span style='flex:1'>Fill: " + (idf.fullName || idf.email || "identity") + "</span><span style='font-size:11px;color:" + ACCENT + "'>fill</span>");
        row.addEventListener("mousedown", (e) => { e.preventDefault(); fillIdentity(idf); closeMenu(); });
        box.appendChild(row);
        document.body.appendChild(menu);
      });
    } catch {}
  }

  function idValue(idf, el) {
    const ac = (el.autocomplete || "").toLowerCase(), h = attrHay(el), t = el.type;
    const has = (re) => re.test(ac) || re.test(h);
    if (t === "email" || has(/e-?mail/)) return idf.email;
    if (has(/given|first.?name/)) return (idf.fullName || "").split(" ")[0];
    if (has(/family|last.?name|surname/)) return (idf.fullName || "").split(" ").slice(1).join(" ");
    if (has(/full.?name|(^|[^a-z])name([^a-z]|$)/)) return idf.fullName;
    if (t === "tel" || has(/phone|mobile|tel/)) return idf.phone;
    if (has(/street|address.?line.?1|address1|(^|[^a-z])address([^a-z]|$)/)) return idf.address;
    if (has(/(^|[^a-z])city|town|locality/)) return idf.city;
    if (has(/zip|postal|postcode/)) return idf.zip;
    if (has(/country/)) return idf.country;
    return null;
  }
  function fillIdentity(idf) {
    const a = document.activeElement;
    const form = a && a.closest ? (a.closest("form") || document) : document;
    [...form.querySelectorAll("input, textarea")].filter(visible).forEach((el) => {
      const v = idValue(idf, el);
      if (v) setValue(el, v);
    });
    flashNote("👤 identity filled");
  }

  function offerCard(anchor) {
    try {
      chrome.runtime.sendMessage({ type: "vault-cards" }, (res) => {
        if (chrome.runtime.lastError) return;
        const cards = (res && res.cards) || [];
        if (!cards.length) return;
        const box = menuShell(anchor);
        cards.forEach((c) => {
          const row = rowEl(badge("💳", 12) + "<span style='flex:1'>" + (c.brand || "Card") + " •••• " + (c.last4 || "") + "</span><span style='font-size:11px;color:" + ACCENT + "'>fill</span>");
          row.addEventListener("mousedown", (e) => { e.preventDefault(); closeMenu(); fillCard(c.id, anchor); });
          box.appendChild(row);
        });
        const note = rowEl("<span style='flex:1;font-size:11px;color:rgba(244,244,246,0.5)'>🔒 CVV never stored — type it yourself</span>");
        note.style.cursor = "default";
        box.appendChild(note);
        document.body.appendChild(menu);
      });
    } catch {}
  }
  function fillCard(id, anchor) {
    try {
      chrome.runtime.sendMessage({ type: "vault-carddetail", id }, (res) => {
        if (chrome.runtime.lastError) return;
        const f = (res && res.fields) || {};
        if (!f.number) return;
        const form = anchor.closest ? (anchor.closest("form") || document) : document;
        [...form.querySelectorAll("input")].filter(visible).forEach((el) => {
          const ac = (el.autocomplete || "").toLowerCase(), h = attrHay(el);
          if (/cvv|cvc|csc|security.?code|card.?code/.test(ac + " " + h)) return; // NEVER fill CVV
          if (ac.includes("cc-number") || /card.?number|cardnum|ccnum/.test(h)) setValue(el, f.number);
          else if (ac.includes("cc-name") || /name.?on.?card|cardholder|card.?name/.test(h)) setValue(el, f.cardholder);
          else if (ac.includes("cc-exp") || /(^|[^a-z])exp/.test(h)) setValue(el, f.expiry);
        });
        flashNote("💳 card filled — now type your CVV");
      });
    } catch {}
  }

  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (!el || el.tagName !== "INPUT") return;
    if (isOtpField(el)) return offerOtp(el);
    if (isCardNumberField(el)) return offerCard(el);
    const pw = passwordField();
    if (pw && (el === pw || el === userFieldNear(pw))) return requestFill(el);
    if (isIdentityField(el)) return offerIdentity(el);
  });
  document.addEventListener("mousedown", (e) => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);
  window.addEventListener("scroll", closeMenu, { passive: true });

  // ---- capture on submit ----
  function capture() {
    const pw = passwordField();
    if (!pw || !pw.value) return null;
    const user = userFieldNear(pw);
    return {
      site: (location.hostname.replace(/^www\./, "").split(".")[0] || "site"),
      host: location.hostname.replace(/^www\./, ""),
      username: user ? user.value : "",
      password: pw.value,
      url: location.href,
    };
  }

  document.addEventListener("submit", () => {
    const entry = capture();
    if (entry) { try { chrome.runtime.sendMessage({ type: "vault-pending", entry }); } catch {} }
  }, true);

  // also catch button-click logins that don't fire submit
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button, input[type=submit]");
    if (!b) return;
    const entry = capture();
    if (entry) { try { chrome.runtime.sendMessage({ type: "vault-pending", entry }); } catch {} }
  }, true);

  // ---- offer-to-save bubble (shown after navigation) ----
  function showSaveBubble(entry) {
    if (bubble) return;
    bubble = document.createElement("div");
    bubble.style.cssText =
      "all:initial;position:fixed;z-index:2147483647;right:18px;top:18px;width:280px;font-family:" + FONT + ";";
    const card = document.createElement("div");
    card.style.cssText =
      "box-sizing:border-box;background:rgba(18,18,24,0.98);border:1px solid rgba(255,255,255,0.14);" +
      "border-radius:14px;padding:14px;box-shadow:0 16px 44px rgba(0,0,0,0.5);color:#f4f4f6;";
    card.innerHTML =
      "<div style='font-size:13px;font-weight:700;margin-bottom:4px'>Save this login?</div>" +
      "<div style='font-size:11px;color:rgba(244,244,246,0.55);margin-bottom:12px'>" +
      (entry.username ? entry.username + " · " : "") + entry.host + "</div>";
    const rowBtns = document.createElement("div");
    rowBtns.style.cssText = "display:flex;gap:8px;";
    const no = document.createElement("button");
    no.textContent = "Not now";
    no.style.cssText = "all:unset;flex:1;text-align:center;font-family:" + FONT + ";font-size:12px;color:#f4f4f6;" +
      "background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);border-radius:10px;padding:8px 0;cursor:pointer;";
    const yes = document.createElement("button");
    yes.textContent = "Save";
    yes.style.cssText = "all:unset;flex:1;text-align:center;font-family:" + FONT + ";font-size:12px;font-weight:700;" +
      "color:" + ACCENT_INK + ";background:" + ACCENT + ";border-radius:10px;padding:8px 0;cursor:pointer;";
    no.addEventListener("click", () => { clearPending(); hideSave(); });
    yes.addEventListener("click", () => {
      try {
        chrome.runtime.sendMessage({ type: "vault-save", entry }, (res) => {
          if (chrome.runtime.lastError) { yes.textContent = "server off"; return; }
          if (res && res.ok) { yes.textContent = "✓ Saved"; yes.style.background = "#4ade80"; }
          else if (res && res.status === 423) { yes.textContent = "unlock vault first"; }
          else { yes.textContent = "failed"; }
          clearPending();
          setTimeout(hideSave, 900);
        });
      } catch { hideSave(); }
    });
    rowBtns.appendChild(no); rowBtns.appendChild(yes);
    card.appendChild(rowBtns);
    bubble.appendChild(card);
    document.body.appendChild(bubble);
  }
  function hideSave() { if (bubble) { bubble.remove(); bubble = null; } }
  function clearPending() { try { chrome.runtime.sendMessage({ type: "vault-pending-clear" }); } catch {} }

  // on load, ask if a save is pending from the page we just left
  setTimeout(() => {
    try {
      chrome.runtime.sendMessage({ type: "vault-pending-get" }, (res) => {
        if (chrome.runtime.lastError) return;
        if (res && res.pending && res.pending.host === location.hostname.replace(/^www\./, "")) {
          showSaveBubble(res.pending);
        }
      });
    } catch {}
  }, 800);
})();
