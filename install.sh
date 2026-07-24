#!/bin/sh
# Nyx — installer / updater for Linux & macOS (POSIX sh)
#
#   install or update:  curl -fsSL https://raw.githubusercontent.com/RDXFGXY1/nyx/main/install.sh | sh
#
# Why this is safe for your data
# -----------------------------
# Your settings, links, notes, stash, vault token, dictionaries and stats all
# live in the BROWSER's profile (chrome.storage + localStorage), not in this
# folder. An unpacked extension keeps its identity — and therefore its storage
# — as long as the folder PATH stays the same. So this script always updates
# files in place and never moves or renames the install directory.
#
# js/config.js (your personal links) is never overwritten. If the new release
# ships a different one it is written next to it as js/config.new.js.
#
# Environment variables (optional)
#   NYX_DIR   where to install / where the install already is
#   NYX_REF   branch or tag to install from   (default: main)
#   NYX_SRC   local .zip or folder to install from instead of downloading

set -eu

REPO="RDXFGXY1/nyx"
REF="${NYX_REF:-main}"
PARTS="manifest.json index.html save.html css js assets"
KEEP="js/config.js"

STATE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/nyx-updater"
STATE_FILE="$STATE_DIR/install-path"

if [ -t 1 ]; then
  DIM=$(printf '\033[2m'); GRN=$(printf '\033[32m'); YLW=$(printf '\033[33m')
  RED=$(printf '\033[31m'); CYN=$(printf '\033[36m'); MAG=$(printf '\033[35m')
  BLD=$(printf '\033[1m'); RST=$(printf '\033[0m')
else
  DIM=''; GRN=''; YLW=''; RED=''; CYN=''; MAG=''; BLD=''; RST=''
fi

step() { printf '  %s%s%s\n' "$DIM" "$1" "$RST"; }
good() { printf '  %s%s%s\n' "$GRN" "$1" "$RST"; }
note() { printf '  %s%s%s\n' "$YLW" "$1" "$RST"; }
die()  { printf '\n  %sinstall failed: %s%s\n\n' "$RED" "$1" "$RST" >&2; exit 1; }

# NYX in block letters, Tokyo-night neon gradient (truecolor on a TTY).
banner() {
  if [ -t 1 ]; then
    printf '\n'
    printf '\033[38;2;247;118;142m   ███╗   ██╗██╗   ██╗██╗  ██╗\033[0m\n'
    printf '\033[38;2;187;154;247m   ████╗  ██║╚██╗ ██╔╝╚██╗██╔╝\033[0m\n'
    printf '\033[38;2;157;124;216m   ██╔██╗ ██║ ╚████╔╝  ╚███╔╝\033[0m\n'
    printf '\033[38;2;122;162;247m   ██║╚██╗██║  ╚██╔╝   ██╔██╗\033[0m\n'
    printf '\033[38;2;125;207;255m   ██║ ╚████║   ██║   ██╔╝ ██╗\033[0m\n'
    printf '\033[38;2;86;95;137m   ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝\033[0m\n'
    printf '\033[38;2;125;207;255m      new tab, reimagined  \033[38;2;86;95;137m· installer / updater\033[0m\n\n'
  else
    printf '\n  nyx  ·  installer / updater\n\n'
  fi
}

TMP=""
cleanup() { [ -n "$TMP" ] && rm -rf "$TMP"; }
trap cleanup EXIT INT TERM

# manifest.json says name "nyx"?
is_nyx() {
  [ -n "${1:-}" ] && [ -f "$1/manifest.json" ] && grep -q '"name"[[:space:]]*:[[:space:]]*"nyx"' "$1/manifest.json"
}

# read "version" out of a manifest.json
ver_of() {
  sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1/manifest.json" 2>/dev/null | head -n1
}

extract() { # <zip> <dest>
  mkdir -p "$2"
  if command -v unzip >/dev/null 2>&1; then
    unzip -q -o "$1" -d "$2"
  elif command -v bsdtar >/dev/null 2>&1; then
    bsdtar -xf "$1" -C "$2"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$1" "$2"
  else
    die "need 'unzip' (or bsdtar/python3) to unpack the download"
  fi
}

banner

# ---------- 1. where does it live? ----------
TARGET=""; REASON=""; FRESH=0

if [ -n "${NYX_DIR:-}" ]; then
  TARGET="$NYX_DIR"; REASON="NYX_DIR"
elif [ -f "$STATE_FILE" ] && is_nyx "$(cat "$STATE_FILE")"; then
  TARGET="$(cat "$STATE_FILE")"; REASON="remembered from last run"
elif is_nyx "$PWD"; then
  TARGET="$PWD"; REASON="current folder"
else
  for guess in "$HOME/.local/share/nyx" "$HOME/nyx" "$HOME/Documents/nyx"; do
    if is_nyx "$guess"; then TARGET="$guess"; REASON="found on disk"; break; fi
  done
fi

if [ -z "$TARGET" ]; then
  TARGET="$HOME/.local/share/nyx"; REASON="new install"
fi

# fresh = there is no nyx install at that path yet, however we got the path
OLDVER=""
if is_nyx "$TARGET"; then FRESH=0; OLDVER="$(ver_of "$TARGET")"; else FRESH=1; fi

step "folder   $TARGET  ($REASON)"
[ -n "$OLDVER" ] && step "installed  v$OLDVER"

# ---------- 2. get the new files ----------
TMP="$(mktemp -d "${TMPDIR:-/tmp}/nyx.XXXXXX")"
SRC="$TMP/src"

if [ -n "${NYX_SRC:-}" ]; then
  step "source   $NYX_SRC"
  if [ -d "$NYX_SRC" ]; then
    mkdir -p "$SRC"
    for p in $PARTS; do
      [ -e "$NYX_SRC/$p" ] && cp -R "$NYX_SRC/$p" "$SRC/"
    done
  else
    extract "$NYX_SRC" "$SRC"
  fi
else
  URL="https://github.com/$REPO/archive/refs/heads/$REF.zip"
  step "download $URL"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$URL" -o "$TMP/nyx.zip" || die "download failed — check your connection or NYX_REF"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$TMP/nyx.zip" "$URL" || die "download failed — check your connection or NYX_REF"
  else
    die "need curl or wget"
  fi
  step "got      $(du -k "$TMP/nyx.zip" | cut -f1) KB"
  extract "$TMP/nyx.zip" "$SRC"
fi

# the zip unpacks into a single <repo>-<ref> folder
ROOT="$SRC"
if [ ! -f "$ROOT/manifest.json" ]; then
  inner="$(find "$SRC" -mindepth 1 -maxdepth 1 -type d | head -n1)"
  [ -n "$inner" ] && ROOT="$inner"
fi

is_nyx "$ROOT" || die "the download doesn't look like nyx (no valid manifest.json)"
NEWVER="$(ver_of "$ROOT")"
step "release  v$NEWVER"

if [ -n "$OLDVER" ] && [ "$OLDVER" = "$NEWVER" ]; then
  note "already on v$NEWVER — reinstalling the same version"
fi

# ---------- 3. back up the current code ----------
if [ "$FRESH" -eq 0 ]; then
  BK_DIR="$STATE_DIR/backups"
  mkdir -p "$BK_DIR"
  STAMP="$(date +%Y%m%d-%H%M%S)"
  BK="$BK_DIR/nyx-v$OLDVER-$STAMP.tar.gz"
  ( cd "$TARGET" && tar -czf "$BK" $(for p in manifest.json index.html save.html css js; do [ -e "$p" ] && printf '%s ' "$p"; done) ) \
    && step "backup   $BK"
  # keep the three most recent
  ls -1t "$BK_DIR"/nyx-v*.tar.gz 2>/dev/null | tail -n +4 | while read -r old; do rm -f "$BK_DIR/$(basename "$old")"; done
fi

# ---------- 4. stash the files we must not clobber ----------
mkdir -p "$TMP/keep"
for k in $KEEP; do
  if [ -f "$TARGET/$k" ]; then
    mkdir -p "$TMP/keep/$(dirname "$k")"
    cp "$TARGET/$k" "$TMP/keep/$k"
  fi
done

# ---------- 5. copy the new files in place ----------
mkdir -p "$TARGET"
for p in $PARTS; do
  [ -e "$ROOT/$p" ] || continue
  if [ -d "$ROOT/$p" ]; then
    mkdir -p "$TARGET/$p"
    cp -R "$ROOT/$p/." "$TARGET/$p/"
  else
    cp "$ROOT/$p" "$TARGET/$p"
  fi
done
good "updated  $(echo $PARTS | tr ' ' ',')"

# ---------- 6. put personal files back ----------
for k in $KEEP; do
  [ -f "$TMP/keep/$k" ] || continue
  if [ -f "$TARGET/$k" ] && ! cmp -s "$TMP/keep/$k" "$TARGET/$k"; then
    newf="$(echo "$TARGET/$k" | sed 's/\.js$/.new.js/')"
    cp "$TARGET/$k" "$newf"
    cp "$TMP/keep/$k" "$TARGET/$k"
    note "kept     $k (the new default is beside it as $(basename "$newf"))"
  else
    cp "$TMP/keep/$k" "$TARGET/$k"
    step "kept     $k"
  fi
done

# remember where we put it
mkdir -p "$STATE_DIR"
printf '%s' "$TARGET" > "$STATE_FILE"

# ---------- 7. what now ----------
printf '\n'
if [ "$FRESH" -eq 1 ]; then
  good "installed v$NEWVER"
  printf '\n  %sload it once:%s\n' "$BLD" "$RST"
  printf '    1. open  brave://extensions   (or chrome://extensions)\n'
  printf '    2. turn on  Developer mode\n'
  printf '    3. click  Load unpacked  and pick:\n'
  printf '       %s%s%s\n\n' "$CYN" "$TARGET" "$RST"
  printf "  keep that folder where it is — the extension's saved data is tied to this path.\n"
else
  good "updated  v$OLDVER -> v$NEWVER"
  printf '\n  %slast step: open  brave://extensions  and click the reload arrow on nyx.%s\n' "$BLD" "$RST"
  printf '  your settings, links, notes and stash are untouched.\n'
fi
printf '\n'
