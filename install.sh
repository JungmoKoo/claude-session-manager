#!/usr/bin/env bash
# claude-session installer
#
#   curl -fsSL https://raw.githubusercontent.com/JungmoKoo/claude-session-manager/main/install.sh | bash
#
# Env overrides:
#   CLAUDE_SESSION_REPO    e.g. "JungmoKoo/claude-session-manager"   (default below)
#   CLAUDE_SESSION_BRANCH  e.g. "main" (default)
#   PREFIX                 install dir (default: $HOME/.local/bin)
set -euo pipefail

REPO="${CLAUDE_SESSION_REPO:-JungmoKoo/claude-session-manager}"
BRANCH="${CLAUDE_SESSION_BRANCH:-main}"
DEST_DIR="${PREFIX:-$HOME/.local/bin}"
DEST="$DEST_DIR/claude-session"
URL="https://raw.githubusercontent.com/$REPO/$BRANCH/claude-session"

mkdir -p "$DEST_DIR"
echo "Downloading $URL"
if command -v curl >/dev/null; then
  curl -fsSL "$URL" -o "$DEST"
elif command -v wget >/dev/null; then
  wget -qO "$DEST" "$URL"
else
  echo "error: need curl or wget" >&2; exit 1
fi
chmod +x "$DEST"
echo "Installed: $DEST"

# On Git Bash / MSYS / Cygwin, also drop a .cmd shim so PowerShell and
# cmd.exe (which can't execute extensionless bash scripts) can invoke
# claude-session by name.
case "$(uname)" in
  MINGW*|MSYS*|CYGWIN*)
    cat >"$DEST_DIR/claude-session.cmd" <<'CMD'
@echo off
setlocal
rem Locate a bash.exe; Git for Windows is the most common source.
set "BASH=C:\Program Files\Git\bin\bash.exe"
if not exist "%BASH%" set "BASH=C:\Program Files\Git\usr\bin\bash.exe"
if not exist "%BASH%" set "BASH=bash"
"%BASH%" "%~dp0claude-session" %*
CMD
    echo "Installed: $DEST_DIR/claude-session.cmd  (PowerShell / cmd.exe shim)"
    ;;
esac

# PATH check
case ":$PATH:" in
  *":$DEST_DIR:"*) ;;
  *) echo
     echo "warning: $DEST_DIR is not on PATH"
     echo "  add this to your shell rc:"
     echo "    export PATH=\"$DEST_DIR:\$PATH\""
     ;;
esac

# Dependency check
missing=()
for dep in jq python3; do
  command -v "$dep" >/dev/null || missing+=("$dep")
done
if (( ${#missing[@]} )); then
  echo
  echo "warning: missing dependencies: ${missing[*]}"
  case "$(uname)" in
    Darwin) echo "  brew install ${missing[*]}" ;;
    Linux)  echo "  sudo apt install ${missing[*]}    # Debian/Ubuntu"
            echo "  sudo dnf install ${missing[*]}    # Fedora" ;;
    MINGW*|MSYS*|CYGWIN*)
            for d in "${missing[@]}"; do
              case "$d" in
                jq)      echo "  winget install jqlang.jq" ;;
                python3) echo "  install Python 3 from https://www.python.org/downloads/"
                         echo "    (Windows' default 'python3' alias is often a Microsoft Store"
                         echo "     redirector; claude-session also accepts 'py -3' or 'python')" ;;
              esac
            done ;;
  esac
fi
