# claude-session

A small CLI for managing [Claude Code](https://claude.com/claude-code) session
logs — list past sessions with `/resume`-style titles, and delete the ones
you don't need.

## 🚀 Install — 2 steps

### 1️⃣ Install **bun**

```bash
curl -fsSL https://bun.sh/install | bash
```

> **Windows PowerShell**
> ```powershell
> irm https://bun.sh/install.ps1 | iex
> ```

Restart your shell so PATH is refreshed.

### 2️⃣ Install **claude-session**

```bash
curl -fsSL https://raw.githubusercontent.com/JungmoKoo/claude-session-manager/main/install.sh | bash
```

> **Windows PowerShell**
> ```powershell
> iwr https://raw.githubusercontent.com/JungmoKoo/claude-session-manager/main/install.sh -OutFile "$env:TEMP\install.sh"
> & "$env:ProgramFiles\Git\bin\bash.exe" "$env:TEMP\install.sh"
> ```

Installs to `~/.local/bin/claude-session`. Override with `PREFIX=/your/path`.
On Windows the installer also drops a `claude-session.cmd` shim so
PowerShell and `cmd.exe` can invoke it by name.

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
claude-session list                  # all sessions, newest first
claude-session list --here           # only sessions started in $PWD
claude-session start <name>          # launch a new session pre-named with <name>
claude-session resume <id|title>     # resume by UUID prefix or by session title
claude-session delete <id>           # delete by UUID or unique 4+ char prefix
claude-session delete <id> -f        # skip confirmation
claude-session help
```

Example `list` output:

```
ID        MODIFIED             TITLE                                   MSGS  PROJECT
a1b2c3d4  2026-04-12 14:32:01  fix the failing test in auth module      127  ~/projects/myapp
e5f6a7b8  2026-04-11 09:15:48  /review                                   42  ~/projects/myapp
9c8d7e6f  2026-04-10 18:44:22  /plan add OAuth login                    310  ~/projects/another-app
```

`resume` accepts a UUID prefix (≥ 4 hex chars) or a session title
(case-insensitive substring match against the same title shown by `list`).
Ambiguous queries are rejected to prevent acting on the wrong session.
`resume` reads the session's original `cwd` from the JSONL itself (more
reliable than decoding the project directory name) and `cd`s there before
handing off to `claude --resume <uuid>`.

`start <name>` execs `claude --name <name>`, which sets the same display
title that `/rename` writes — saving a `/rename` step at the top of a fresh
session.

`delete` accepts UUID prefixes (≥ 4 chars). The session's sidecar directory
(`<uuid>/`) is removed alongside the `.jsonl`.

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

The script is a single TypeScript file run by [bun](https://bun.sh) — no
separate `jq` / `python3` dependencies. The installer drops the `.ts`
plus a tiny shell/`.cmd` wrapper that locates `bun` (in `PATH` or at
`~/.bun/bin/bun`) and execs it on the script.

## License

MIT
