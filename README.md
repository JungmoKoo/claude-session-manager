# claude-session

A small CLI for managing [Claude Code](https://claude.com/claude-code) session logs — list, resume, start, and delete sessions by UUID prefix or title.

```
ID        MODIFIED    TITLE                       MSGS   PROJECT
a1b2c3d4  just now    fix auth bug                 127   ~/projects/myapp
e5f6a7b8  2h ago      /review                       42   ~/projects/myapp
9c8d7e6f  6d ago      /plan add OAuth login        310   ~/projects/another
```

---

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

---

## 📋 Usage

```bash
claude-session list                # all sessions, newest first
claude-session list --here         # only sessions started in $PWD
claude-session start <name>        # launch a new session pre-named
claude-session resume <id|title>   # resume by UUID prefix or title
claude-session delete <id>         # delete by UUID prefix
claude-session help
```

`resume` accepts a UUID prefix (≥ 4 hex chars) **or** a case-insensitive title
substring. `start <name>` execs `claude --name <name>` — equivalent to running
`/rename` at the top of a fresh session.

## ↩️ Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/JungmoKoo/claude-session-manager/main/uninstall.sh | bash
```

> **Windows PowerShell**
> ```powershell
> iwr https://raw.githubusercontent.com/JungmoKoo/claude-session-manager/main/uninstall.sh -OutFile "$env:TEMP\uninstall.sh"
> & "$env:ProgramFiles\Git\bin\bash.exe" "$env:TEMP\uninstall.sh"
> ```

Your session data (`~/.claude/projects/`, `~/.claude/history.jsonl`) is untouched.

## License

MIT
