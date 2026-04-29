#!/usr/bin/env bash
# claude-session uninstaller
#
#   curl -fsSL https://raw.githubusercontent.com/JungmoKoo/claude-session-manager/main/uninstall.sh | bash
#
# Env overrides:
#   PREFIX     install dir (default: $HOME/.local/bin)
#              set this if you installed with a custom PREFIX.
set -euo pipefail

DEST_DIR="${PREFIX:-$HOME/.local/bin}"
DEST="$DEST_DIR/claude-session"

if [[ -e "$DEST" || -L "$DEST" ]]; then
  rm -f "$DEST"
  echo "removed $DEST"
else
  echo "not found at $DEST (already uninstalled?)"
  echo "  if you installed with a custom PREFIX, re-run:"
  echo "    PREFIX=/your/path bash uninstall.sh"
fi

echo
echo "Note: your Claude Code session data is untouched."
echo "  ~/.claude/projects/         (session logs)"
echo "  ~/.claude/history.jsonl     (prompt history)"
echo "Delete those manually if you want — claude-session never owned them."
