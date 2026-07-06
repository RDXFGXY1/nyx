# Vault — the password manager

Open with the **key button** (top bar), **`Alt+P`**, or **`>vault`**.
Requires the backend running.

## Sections

The vault has four tabs:

- **passwords** — logins (site, username, password, url).
- **2FA** — authenticator codes. Shows a live 6-digit code with a countdown bar;
  tap to copy. Add by pasting a base32 secret **or** a full `otpauth://` link.
- **identity** — your name / email / phone / address, for form autofill.
- **cards** — payment cards (see the safety note below).

The **＋ add** button sits at the top of each section; the list scrolls beneath
it, so adding is always reachable no matter how many items you have.

## First use

1. Open the vault → **create a master password**. This is the key to everything
   and **cannot be recovered** — don't forget it.
2. The vault stays **unlocked in memory** until you lock it, the backend
   restarts, or it **auto-locks after 10 minutes idle**.
3. Forgot the master password? The unlock screen has **"reset the vault"** —
   this wipes it and starts fresh (it can't decrypt the old data; that's the
   point of real encryption).

## Autofill (on any web page)

- **Logins** — click a username/password field → a menu of saved logins for that
  site → click to fill. Multiple accounts show as separate rows.
- **Suggest strong password** — on signup pages, the same menu offers a
  cryptographically strong password; it fills the password + confirm fields and
  copies to your clipboard.
- **Save on submit** — logging in on a new site pops a "Save this login?" bubble
  (it survives the page redirect).
- **2FA codes** — on a one-time-code field, the menu lists your live codes.
- **Identity** — on name/address/email fields, "Fill: <you>" fills the whole form.
- **Cards** — on a card-number field, pick a card to fill number + name + expiry.

## Import

Passwords section → **import CSV** — accepts the common browser/Bitwarden export
columns (`name,url,username,password`, quoted fields, etc.). **Delete the CSV
afterward** — it's plain text with every password readable.

## Password health

The passwords section flags **weak**, **reused**, and **old** entries with
badges, and summarizes them ("⚠ 2 weak · 1 reused") at the top.

---

## Security model

**What's protected well:**

- **Encryption at rest** — AES-256-GCM. The key is derived from your master
  password via PBKDF2 (210k iterations, SHA-256). The master password is never
  stored; only a verifier is. The DB file `vault.dat` holds ciphertext, salt,
  and hashes — no plaintext.
- **Network isolation** — every vault endpoint (except `/status`) requires a
  secret token (`X-Vault-Token`) held only by the extension, so a random website
  hitting `127.0.0.1:5055` gets **401**. On the LAN, the whole `/api/*` surface
  (vault included) is firewalled off entirely.
- **In-page separation** — the content script never talks to the vault directly;
  it routes through the background worker, which holds the token.
- **Cards — extra safe:** the **CVV is never stored** (you type it at checkout,
  every time). Card numbers are **masked to last-4** everywhere; the full number
  is fetched only on an explicit reveal or fill click, while the vault is
  unlocked. Card autofill never touches a CVV field.
- **TOTP** — the 2FA algorithm is verified correct against the RFC 6238 test
  vector; codes are computed live and are genuine.

**Honest limitations — read these:**

- **No master-password recovery.** Lose it and the data is gone. That's by design.
- **While unlocked, secrets live decrypted in the backend's memory** — same as
  any password manager, but real.
- This is a solid **personal, local** tool. It is **not** independently audited
  like Bitwarden/1Password. For your highest-value accounts (bank, primary
  email), consider a dedicated manager and keeping 2FA on a separate device.
- **2FA codes are time-based** — if your PC clock drifts from real time, every
  code reads as invalid. Keep "set time automatically" on.

---

## Vault API (backend)

All require header `X-Vault-Token` except `/status`. `423` = locked.

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/vault/status` | `{ setup, unlocked }` (no token). |
| POST | `/api/vault/setup` | Create the vault (`master`, `token`). |
| POST | `/api/vault/unlock` | Unlock with the master password. |
| POST | `/api/vault/lock` | Lock now. |
| POST | `/api/vault/reset` | Wipe the vault. |
| POST | `/api/vault/reprovision` | Re-issue the token (proves master). |
| GET | `/api/vault/entries` | List (masked — no passwords/card numbers). |
| POST/PUT/DELETE | `/api/vault/entries[/{id}]` | Add / update / remove. |
| POST | `/api/vault/import` | Bulk add (CSV import). |
| GET | `/api/vault/reveal/{id}` | One login's password. |
| GET | `/api/vault/detail/{id}` | Full fields (card number, address…). |
| GET | `/api/vault/totp/{id}` | A 2FA entry's secret (for the live display). |
| GET | `/api/vault/otpcodes` | Current codes for all 2FA entries (in-page fill). |
| GET | `/api/vault/match?host=` | Logins matching a site (in-page fill). |
| GET | `/api/vault/health` | Weak / reused / old analysis. |
