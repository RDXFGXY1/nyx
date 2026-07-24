#!/bin/sh
# Nyx — installer / updater for Linux & macOS (POSIX sh)
#
#   install or update:  curl -fsSL https://raw.githubusercontent.com/RDXFGXY1/nyx/main/install.sh | sh
#
# Why this is safe for your data
# ------------------------------
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
#   NYX_DIR    where to install / where the install already is
#   NYX_REF    branch or tag to install from   (default: main)
#   NYX_SRC    local .zip or folder to install from instead of downloading
#   NYX_PLAIN  set to 1 to disable animation / color
#   NYX_ANIM   set to 1 to force animation / color (e.g. when piping)

set -eu

REPO="RDXFGXY1/nyx"
REF="${NYX_REF:-main}"
PARTS="manifest.json index.html save.html css js assets"
KEEP="js/config.js"

STATE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/nyx-updater"
STATE_FILE="$STATE_DIR/install-path"

# ---------- terminal capabilities ----------
TC=0; ANIM=0
[ -t 1 ] && { TC=1; ANIM=1; }
[ -n "${NYX_ANIM:-}" ] && { TC=1; ANIM=1; }
[ -n "${NYX_PLAIN:-}" ] && { TC=0; ANIM=0; }

# Tokyo Night palette (stored as real escape bytes so %s prints them)
if [ "$TC" -eq 1 ]; then
  PINK=$(printf '\033[38;2;247;118;142m'); PUR=$(printf '\033[38;2;187;154;247m')
  VIO=$(printf  '\033[38;2;157;124;216m'); BLU=$(printf '\033[38;2;122;162;247m')
  CYN=$(printf  '\033[38;2;125;207;255m'); GRN=$(printf '\033[38;2;158;206;106m')
  YLW=$(printf  '\033[38;2;224;175;104m'); FG=$(printf  '\033[38;2;192;202;245m')
  DIMC=$(printf '\033[38;2;86;95;137m');   RST=$(printf '\033[0m')
else
  PINK=''; PUR=''; VIO=''; BLU=''; CYN=''; GRN=''; YLW=''; FG=''; DIMC=''; RST=''
fi

# fractional sleep support (integer-only sleep would error on "0.08")
NAP=0
if [ "$ANIM" -eq 1 ] && sleep 0.02 2>/dev/null; then NAP=1; fi
nap() { [ "$NAP" -eq 1 ] && sleep "${1:-0.08}" 2>/dev/null || :; }

# ---------- primitives ----------
row()  { printf '  %s▸%s %s%s%s  %s%s%s\n' "$VIO" "$RST" "$DIMC" "$1" "$RST" "$3" "$2" "$RST"; }
ok()   { printf '  %s✔%s %s%s%s\n' "$GRN" "$RST" "$FG" "$1" "$RST"; }
warn() { printf '  %s!%s %s%s%s\n' "$YLW" "$RST" "$YLW" "$1" "$RST"; }
die()  { printf '\n  %s✖ install failed: %s%s\n\n' "$PINK" "$1" "$RST" >&2; exit 1; }

spin_frame() {
  case $(( $1 % 10 )) in
    0) printf '⠋';; 1) printf '⠙';; 2) printf '⠹';; 3) printf '⠸';; 4) printf '⠼';;
    5) printf '⠴';; 6) printf '⠦';; 7) printf '⠧';; 8) printf '⠇';; 9) printf '⠏';;
  esac
}

bar() { # <done> <total> <width>
  _f=$(( $1 * $3 / $2 )); [ "$_f" -gt "$3" ] && _f="$3"; _i=0
  printf '%s' "$CYN"; while [ "$_i" -lt "$_f" ]; do printf '█'; _i=$((_i+1)); done
  printf '%s' "$DIMC"; while [ "$_i" -lt "$3" ]; do printf '░'; _i=$((_i+1)); done
  printf '%s' "$RST"
}

kb() { if [ -f "$1" ]; then echo $(( $(wc -c < "$1" 2>/dev/null || echo 0) / 1024 )); else echo 0; fi; }

# framed result box. Rows are single-color (text is ASCII) so ${#text} is the
# exact on-screen width and the right border always lines up.
HR=$(_i=0; while [ "$_i" -lt 48 ]; do printf '─'; _i=$((_i+1)); done)
box_top() { printf '  %s╭%s╮%s\n' "$1" "$HR" "$RST"; }
box_bot() { printf '  %s╰%s╯%s\n' "$1" "$HR" "$RST"; }
box_line() { # <border> <color> <text-ascii>
  _p=$(( 48 - 1 - ${#3} )); [ "$_p" -lt 0 ] && _p=0
  printf '  %s│%s %s%s%s%*s%s│%s\n' "$1" "$RST" "$2" "$3" "$RST" "$_p" '' "$1" "$RST"
}
box_status() { # <border> <text-ascii>   (green check + text)
  _p=$(( 48 - 3 - ${#2} )); [ "$_p" -lt 0 ] && _p=0
  printf '  %s│%s %s✔%s %s%s%s%*s%s│%s\n' "$1" "$RST" "$GRN" "$RST" "$FG" "$2" "$RST" "$_p" '' "$1" "$RST"
}

banner() {
  if [ "$TC" -eq 0 ]; then printf '\n  nyx  -  installer / updater\n\n'; return; fi
  printf '\n'
  printf '%s   ███╗   ██╗██╗   ██╗██╗  ██╗%s\n' "$PINK" "$RST"; nap 0.045
  printf '%s   ████╗  ██║╚██╗ ██╔╝╚██╗██╔╝%s\n' "$PUR"  "$RST"; nap 0.045
  printf '%s   ██╔██╗ ██║ ╚████╔╝  ╚███╔╝%s\n'  "$VIO"  "$RST"; nap 0.045
  printf '%s   ██║╚██╗██║  ╚██╔╝   ██╔██╗%s\n'  "$BLU"  "$RST"; nap 0.045
  printf '%s   ██║ ╚████║   ██║   ██╔╝ ██╗%s\n' "$CYN"  "$RST"; nap 0.045
  printf '%s   ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝%s\n'  "$DIMC" "$RST"; nap 0.045
  printf '%s   new tab, reimagined  %s· installer / updater%s\n\n' "$CYN" "$DIMC" "$RST"
}

TMP=""
cleanup() { [ -n "$TMP" ] && rm -rf "$TMP"; }
trap cleanup EXIT INT TERM

is_nyx() {
  [ -n "${1:-}" ] && [ -f "$1/manifest.json" ] && grep -q '"name"[[:space:]]*:[[:space:]]*"nyx"' "$1/manifest.json"
}
ver_of() {
  sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1/manifest.json" 2>/dev/null | head -n1
}
extract() { # <zip> <dest>
  mkdir -p "$2"
  if command -v unzip >/dev/null 2>&1; then unzip -q -o "$1" -d "$2"
  elif command -v bsdtar >/dev/null 2>&1; then bsdtar -xf "$1" -C "$2"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$1" "$2"
  else die "need 'unzip' (or bsdtar/python3) to unpack the download"; fi
}

# animated download (background job + spinner + live KB)
download() { # <url> <zip>
  if [ "$ANIM" -eq 0 ]; then
    if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2" || die "download failed — check your connection or NYX_REF"
    elif command -v wget >/dev/null 2>&1; then wget -qO "$2" "$1" || die "download failed — check your connection or NYX_REF"
    else die "need curl or wget"; fi
    ok "downloaded $(kb "$2") KB"; return
  fi
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2" &
  elif command -v wget >/dev/null 2>&1; then wget -qO "$2" "$1" &
  else die "need curl or wget"; fi
  _pid=$!; _i=0
  while kill -0 "$_pid" 2>/dev/null; do
    printf '\r  %s%s%s %sdownloading%s  %s%8s KB%s   ' "$CYN" "$(spin_frame $_i)" "$RST" "$FG" "$RST" "$PUR" "$(kb "$2")" "$RST"
    nap; _i=$((_i+1))
  done
  wait "$_pid" || die "download failed — check your connection or NYX_REF"
  printf '\r  %s✔%s %sdownloaded %s%s KB%s                 \n' "$GRN" "$RST" "$FG" "$PUR" "$(kb "$2")" "$RST"
}

banner

# ---------- 1. where does it live? ----------
TARGET=""; REASON=""
if [ -n "${NYX_DIR:-}" ]; then
  TARGET="$NYX_DIR"; REASON="NYX_DIR"
elif [ -f "$STATE_FILE" ] && is_nyx "$(cat "$STATE_FILE")"; then
  TARGET="$(cat "$STATE_FILE")"; REASON="remembered"
elif is_nyx "$PWD"; then
  TARGET="$PWD"; REASON="current folder"
else
  for guess in "$HOME/.local/share/nyx" "$HOME/nyx" "$HOME/Documents/nyx"; do
    if is_nyx "$guess"; then TARGET="$guess"; REASON="found on disk"; break; fi
  done
fi
[ -z "$TARGET" ] && { TARGET="$HOME/.local/share/nyx"; REASON="new install"; }

OLDVER=""
if is_nyx "$TARGET"; then FRESH=0; OLDVER="$(ver_of "$TARGET")"; else FRESH=1; fi

if [ "$FRESH" -eq 1 ]; then MODE="fresh install  ($REASON)"; else MODE="update  ($REASON)"; fi
row "folder " "$TARGET" "$FG"
row "mode   " "$MODE" "$CYN"
[ -n "$OLDVER" ] && row "have   " "v$OLDVER" "$DIMC"

# ---------- 2. get the new files ----------
TMP="$(mktemp -d "${TMPDIR:-/tmp}/nyx.XXXXXX")"
SRC="$TMP/src"

if [ -n "${NYX_SRC:-}" ]; then
  row "source " "$NYX_SRC" "$FG"
  if [ -d "$NYX_SRC" ]; then
    mkdir -p "$SRC"
    for p in $PARTS; do [ -e "$NYX_SRC/$p" ] && cp -R "$NYX_SRC/$p" "$SRC/"; done
  else
    extract "$NYX_SRC" "$SRC"
  fi
else
  download "https://github.com/$REPO/archive/refs/heads/$REF.zip" "$TMP/nyx.zip"
  extract "$TMP/nyx.zip" "$SRC"
fi

ROOT="$SRC"
if [ ! -f "$ROOT/manifest.json" ]; then
  inner="$(find "$SRC" -mindepth 1 -maxdepth 1 -type d | head -n1)"
  [ -n "$inner" ] && ROOT="$inner"
fi
is_nyx "$ROOT" || die "the download doesn't look like nyx (no valid manifest.json)"
NEWVER="$(ver_of "$ROOT")"
row "release" "v$NEWVER" "$GRN"
[ -n "$OLDVER" ] && [ "$OLDVER" = "$NEWVER" ] && warn "already on v$NEWVER - reinstalling the same version"

# ---------- 3. back up the current code ----------
if [ "$FRESH" -eq 0 ]; then
  BK_DIR="$STATE_DIR/backups"; mkdir -p "$BK_DIR"
  BK="$BK_DIR/nyx-v$OLDVER-$(date +%Y%m%d-%H%M%S).tar.gz"
  ( cd "$TARGET" && tar -czf "$BK" $(for p in manifest.json index.html save.html css js; do [ -e "$p" ] && printf '%s ' "$p"; done) ) \
    && ok "backed up current build  $DIMC$(basename "$BK")$RST"
  ls -1t "$BK_DIR"/nyx-v*.tar.gz 2>/dev/null | tail -n +4 | while read -r old; do rm -f "$BK_DIR/$(basename "$old")"; done
fi

# ---------- 4. stash the files we must not clobber ----------
mkdir -p "$TMP/keep"
for k in $KEEP; do
  if [ -f "$TARGET/$k" ]; then mkdir -p "$TMP/keep/$(dirname "$k")"; cp "$TARGET/$k" "$TMP/keep/$k"; fi
done

# ---------- 5. copy the new files in place (progress bar) ----------
mkdir -p "$TARGET"
present=""; total=0
for p in $PARTS; do [ -e "$ROOT/$p" ] && { present="$present $p"; total=$((total+1)); }; done
[ "$total" -eq 0 ] && total=1
n=0
for p in $present; do
  if [ -d "$ROOT/$p" ]; then mkdir -p "$TARGET/$p"; cp -R "$ROOT/$p/." "$TARGET/$p/"
  else cp "$ROOT/$p" "$TARGET/$p"; fi
  n=$((n+1))
  if [ "$ANIM" -eq 1 ]; then
    printf '\r  %s%s%s %sinstalling %s%s %s%d/%d  %s%s        ' "$CYN" "$(spin_frame $n)" "$RST" "$FG" "$RST" "$(bar $n $total 22)" "$DIMC" "$n" "$total" "$p" "$RST"
    nap 0.06
  fi
done
if [ "$ANIM" -eq 1 ]; then
  printf '\r  %s✔%s %sinstalled  %s                              \n' "$GRN" "$RST" "$FG" "$(bar 1 1 22)"
else
  ok "installed $(echo "$present" | sed 's/^ //; s/ /, /g')"
fi

# ---------- 6. put personal files back ----------
for k in $KEEP; do
  [ -f "$TMP/keep/$k" ] || continue
  if [ -f "$TARGET/$k" ] && ! cmp -s "$TMP/keep/$k" "$TARGET/$k"; then
    newf="$(echo "$TARGET/$k" | sed 's/\.js$/.new.js/')"
    cp "$TARGET/$k" "$newf"; cp "$TMP/keep/$k" "$TARGET/$k"
    ok "kept your $k  ${DIMC}new default -> $(basename "$newf")${RST}"
  else
    cp "$TMP/keep/$k" "$TARGET/$k"; ok "kept your $k"
  fi
done

mkdir -p "$STATE_DIR"; printf '%s' "$TARGET" > "$STATE_FILE"

# ---------- 7. done ----------
printf '\n'
if [ "$FRESH" -eq 1 ]; then
  box_top "$BLU"
  box_status "$BLU" "installed  nyx v$NEWVER"
  box_line "$BLU" "$DIMC" "load it in your browser to finish:"
  box_line "$BLU" "$FG" "  1  open  brave://extensions"
  box_line "$BLU" "$FG" "  2  turn on  Developer mode"
  box_line "$BLU" "$FG" "  3  Load unpacked  ->  the folder below"
  box_bot "$BLU"
  printf '\n  %s%s%s\n' "$CYN" "$TARGET" "$RST"
  printf '  %skeep that folder put - the extension'"'"'s saved data is tied to its path.%s\n' "$DIMC" "$RST"
else
  box_top "$GRN"
  box_status "$GRN" "updated  v$OLDVER  ->  v$NEWVER"
  box_line "$GRN" "$DIMC" "reload nyx to finish:"
  box_line "$GRN" "$FG" "  open  brave://extensions  ->  reload arrow"
  box_bot "$GRN"
  printf '\n  %syour settings, links, notes and stash are untouched.%s\n' "$DIMC" "$RST"
fi
printf '\n'
