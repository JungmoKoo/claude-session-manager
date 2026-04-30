# claude-session

A small CLI for managing [Claude Code](https://claude.com/claude-code) session
logs — list past sessions with `/resume`-style titles, and delete the ones
you don't need.

## Installation

> **Supported on Linux, macOS, and Windows (via Git Bash).** Works with
> macOS's stock `/bin/bash` (3.2) as well as bash 4+. On Windows the
> installer also drops a `claude-session.cmd` shim so PowerShell and
> `cmd.exe` can invoke it by name.

```bash
curl -fsSL https://raw.githubusercontent.com/JungmoKoo/claude-session-manager/main/install.sh | bash
```

Installs to `~/.local/bin/claude-session`. Override with `PREFIX=/usr/local/bin`.

### Requirements

- `bash` ≥ 3.2 (macOS stock bash works; on Windows, [Git for Windows](https://git-scm.com/download/win) provides one)
- `jq`
- `python3` (for CJK-aware column padding); `py -3` and `python` are also
  accepted, so you don't need a literal `python3` on PATH

```bash
# macOS
brew install jq python3
# Debian / Ubuntu
sudo apt install jq python3
# Windows (Git Bash, run from any shell)
winget install jqlang.jq
# plus Python 3 from https://www.python.org/downloads/
# (Windows' default 'python3' alias is often a Microsoft Store redirector
#  that does nothing; the script transparently falls back to 'py -3' or
#  'python', so installing python.org's Python is enough.)
```

### Windows notes

- For the prettiest table output, run inside a UTF-8 console (Windows
  Terminal works out of the box; in classic `cmd.exe` run `chcp 65001`
  first). Otherwise the U+2500 box-drawing rule degrades gracefully to
  plain ASCII `-`.
- Project paths displayed by `list` are decoded to the `C:/Users/...`
  form. Drive letter case mirrors what was active when Claude Code first
  saw the directory; the `--here` filter normalizes the current shell's
  POSIX cwd back to that form before matching.

## Usage

```
claude-session list              # all sessions, newest first
claude-session list --here       # only sessions started in $PWD
claude-session resume <id>       # resume a session in its original project
claude-session delete <id>       # delete by UUID or unique 4+ char prefix
claude-session delete <id> -f    # skip confirmation
claude-session help
```

Example `list` output:

```
ID        MODIFIED             TITLE                                   MSGS  PROJECT
a1b2c3d4  2026-04-12 14:32:01  fix the failing test in auth module      127  ~/projects/myapp
e5f6a7b8  2026-04-11 09:15:48  /review                                   42  ~/projects/myapp
9c8d7e6f  2026-04-10 18:44:22  /plan add OAuth login                    310  ~/projects/another-app
```

`resume` and `delete` both accept UUID prefixes (≥ 4 chars). Ambiguous prefixes
are rejected to prevent acting on the wrong session. `resume` reads the
session's original `cwd` from the JSONL itself (more reliable than decoding
the project directory name) and `cd`s there before handing off to
`claude --resume <uuid>`. The session's sidecar directory (`<uuid>/`) is
removed by `delete` alongside the `.jsonl`.

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/JungmoKoo/claude-session-manager/main/uninstall.sh | bash
```

Removes only the `claude-session` binary. Your Claude Code session data
(`~/.claude/projects/`, `~/.claude/history.jsonl`) is untouched. Set
`PREFIX=/your/path` if you installed to a custom location.

## How it works

Claude Code stores each session at:

```
~/.claude/projects/<encoded-cwd>/<uuid>.jsonl
```

with an optional sibling `<uuid>/` sidecar. `claude-session list` enumerates
those files and looks up titles from `~/.claude/history.jsonl` — the same
source `/resume` reads — falling back to in-file `last-prompt` records.

Project paths shown by `list` are best-effort decoded (the original
encoding replaces both `/` and `.` with `-`, which isn't perfectly
reversible).

## License

MIT
