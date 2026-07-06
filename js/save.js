/* =========================================================
   save.js — the popup window (right-click flow).
   Category chosen from a dropdown; can hold more than one.
   ========================================================= */

const qs = new URLSearchParams(location.search);
document.getElementById("name").value = qs.get("name") || "";
document.getElementById("url").value = qs.get("url") || "";

const SEL = new Set();

StashCore.init(() => renderCat());

// match the new-tab wallpaper accent
function applyAccent(hex, ink, softRgb) {
  const root = document.documentElement.style;
  if (hex) root.setProperty("--accent", hex);
  if (ink) root.setProperty("--accent-ink", ink);
  root.setProperty("--accent-soft", softRgb ? "rgba(" + softRgb + ",0.16)" : (hex ? hex + "28" : ""));
}
try {
  chrome.storage?.local?.get(["accentColor", "accentInk", "accentSoftRgb"], (r) => {
    if (r && r.accentColor) applyAccent(r.accentColor, r.accentInk, r.accentSoftRgb);
    else { const a = localStorage.getItem("accent"); if (a) applyAccent(a); }
  });
} catch {
  const a = localStorage.getItem("accent");
  if (a) applyAccent(a);
}

function renderCat() {
  const dd = document.getElementById("catsel");
  const cats = StashCore.loadTags().filter((c) => !SEL.has(c));
  dd.innerHTML =
    `<option value="">＋ add category…</option>` +
    cats.map((c) => `<option value="${c}">${c}</option>`).join("") +
    `<option value="__new">✚ new category…</option>`;

  const sel = document.getElementById("sel");
  sel.innerHTML = [...SEL]
    .map((c) => `<span class="selchip">${c}<span class="x" data-rm="${c}">✕</span></span>`)
    .join("");
  sel.querySelectorAll(".x").forEach((b) =>
    b.addEventListener("click", () => { SEL.delete(b.dataset.rm); renderCat(); })
  );
}

const dd = document.getElementById("catsel");
const newcat = document.getElementById("newcat");
dd.addEventListener("change", () => {
  const v = dd.value;
  if (v === "__new") { newcat.style.display = ""; newcat.focus(); }
  else if (v) { SEL.add(v); renderCat(); }
  dd.value = "";
});
function commitNew() {
  const t = StashCore.addTag(newcat.value);
  if (t) SEL.add(t);
  newcat.value = ""; newcat.style.display = "none";
  renderCat();
}
newcat.addEventListener("keydown", (e) => { if (e.key === "Enter") commitNew(); });

document.getElementById("cancel").addEventListener("click", () => window.close());
document.getElementById("save").addEventListener("click", () => {
  const name = document.getElementById("name").value.trim();
  let url = document.getElementById("url").value.trim();
  if (!name && !url) return window.close();
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
  StashCore.addItem({
    id: StashCore.newId(),
    name: name || url,
    url,
    tags: [...SEL],
    done: false,
    added: Date.now(),
  });
  setTimeout(() => window.close(), 60);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.close();
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") document.getElementById("save").click();
});

const nameEl = document.getElementById("name");
nameEl.focus();
nameEl.select();
