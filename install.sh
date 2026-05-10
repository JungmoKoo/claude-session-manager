#!/usr/bin/env bash
# csm (Claude Session Manager) installer
#
#   curl -fsSL https://raw.githubusercontent.com/JungmoKoo/claude-session-manager/main/install.sh | bash
#
# Env overrides:
#   CSM_REPO     e.g. "JungmoKoo/claude-session-manager"   (default below)
#   CSM_BRANCH   e.g. "main" (default)
#   PREFIX       install dir (default: $HOME/.local/bin)
set -euo pipefail

REPO="${CSM_REPO:-JungmoKoo/claude-session-manager}"
BRANCH="${CSM_BRANCH:-main}"
DEST_DIR="${PREFIX:-$HOME/.local/bin}"
TS_URL="https://raw.githubusercontent.com/$REPO/$BRANCH/csm.ts"
TS_DEST="$DEST_DIR/csm.ts"
WRAPPER="$DEST_DIR/csm"

mkdir -p "$DEST_DIR"

# --- 1) Drop csm.ts -------------------------------------------------------
# Use the local file (git-clone install) when it sits next to install.sh,
# otherwise fetch the canonical copy from the repo.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd 2>/dev/null || true)"
if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/csm.ts" ]; then
  cp "$SCRIPT_DIR/csm.ts" "$TS_DEST"
  echo "[OK] csm.ts (local) -> $TS_DEST"
else
  echo "Downloading $TS_URL"
  if command -v curl >/dev/null; then
    curl -fsSL "$TS_URL" -o "$TS_DEST"
  elif command -v wget >/dev/null; then
    wget -qO "$TS_DEST" "$TS_URL"
  else
    echo "error: need curl or wget" >&2; exit 1
  fi
  echo "[OK] csm.ts (fetched) -> $TS_DEST"
fi

# --- 2) Wrapper script ----------------------------------------------------
# Locates bun in PATH or at $HOME/.bun/bin and execs it on the .ts file.
# We don't rely on the .ts shebang because bun may not be on PATH yet
# (e.g. fresh `bun install` before shell restart).
cat > "$WRAPPER" <<'EOF'
#!/bin/sh
DIR="$(cd "$(dirname -- "$0")" && pwd)"
BUN=""
if command -v bun >/dev/null 2>&1; then
  BUN="$(command -v bun)"
elif [ -x "$HOME/.bun/bin/bun" ]; then
  BUN="$HOME/.bun/bin/bun"
elif [ -x "$HOME/.bun/bin/bun.exe" ]; then
  BUN="$HOME/.bun/bin/bun.exe"
fi
if [ -z "$BUN" ]; then
  echo "csm: 'bun' not found." >&2
  echo "  Install: curl -fsSL https://bun.sh/install | bash" >&2
  exit 1
fi
exec "$BUN" "$DIR/csm.ts" "$@"
EOF
chmod +x "$WRAPPER"
echo "[OK] wrapper -> $WRAPPER"

# --- 3) Windows .cmd shim -------------------------------------------------
# Git Bash / MSYS / Cygwin invocations work via the wrapper above, but
# native cmd.exe and PowerShell can't execute extensionless POSIX scripts,
# so we drop a tiny .cmd that calls bun directly on the .ts.
case "$(uname)" in
  MINGW*|MSYS*|CYGWIN*)
    cat >"$DEST_DIR/csm.cmd" <<'CMD'
@echo off
setlocal
set "BUN=%USERPROFILE%\.bun\bin\bun.exe"
if not exist "%BUN%" set "BUN=bun"
"%BUN%" "%~dp0csm.ts" %*
CMD
    echo "[OK] Windows shim -> $DEST_DIR/csm.cmd"
    ;;
esac

# --- PATH check -----------------------------------------------------------
case ":$PATH:" in
  *":$DEST_DIR:"*) ;;
  *) echo
     echo "warning: $DEST_DIR is not on PATH"
     echo "  add this to your shell rc:"
     echo "    export PATH=\"$DEST_DIR:\$PATH\""
     ;;
esac

# --- bun check ------------------------------------------------------------
if ! command -v bun >/dev/null 2>&1 \
   && [ ! -x "$HOME/.bun/bin/bun" ] \
   && [ ! -x "$HOME/.bun/bin/bun.exe" ]; then
  echo
  echo "warning: 'bun' is not installed."
  echo "  Install (Linux/macOS/Git Bash): curl -fsSL https://bun.sh/install | bash"
  echo "  Install (Windows PowerShell):   irm https://bun.sh/install.ps1 | iex"
fi

echo
echo "🎉  Installation complete!"
echo "👉  Try:  csm help"
echo "👉  List your sessions:  csm list"
