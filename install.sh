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
  esac
fi
