#!/usr/bin/env bash
# csm (Claude Session Manager) uninstaller
#
#   curl -fsSL https://raw.githubusercontent.com/JungmoKoo/claude-session-manager/main/uninstall.sh | bash
#
# Env overrides:
#   PREFIX     install dir (default: $HOME/.local/bin)
#              set this if you installed with a custom PREFIX.
set -euo pipefail

DEST_DIR="${PREFIX:-$HOME/.local/bin}"
DEST="$DEST_DIR/csm"
DEST_TS="$DEST_DIR/csm.ts"
DEST_CMD="$DEST_DIR/csm.cmd"

# Also clean up the pre-rename "claude-session" install if it's still
# sitting around from a previous version.
LEGACY=( "$DEST_DIR/claude-session" "$DEST_DIR/claude-session.ts" "$DEST_DIR/claude-session.cmd" )

removed=0
for f in "$DEST" "$DEST_TS" "$DEST_CMD" "${LEGACY[@]}"; do
  if [[ -e "$f" || -L "$f" ]]; then
    rm -f "$f"
    echo "removed $f"
    removed=1
  fi
done

if (( ! removed )); then
  echo "not found at $DEST (already uninstalled?)"
  echo "  if you installed with a custom PREFIX, re-run:"
  echo "    PREFIX=/your/path bash uninstall.sh"
fi

echo
if (( removed )); then
  echo "✅  Uninstall complete!"
else
  echo "ℹ️   Nothing to uninstall."
fi
echo "👉  Your Claude Code session data is preserved (delete manually if you want):"
echo "      ~/.claude/projects/        (session logs)"
echo "      ~/.claude/history.jsonl    (prompt history)"
