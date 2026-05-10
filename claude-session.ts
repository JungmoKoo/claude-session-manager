#!/usr/bin/env bun
// claude-session — list, start, resume, and delete Claude Code session logs.
//
// Sessions live under $HOME/.claude/projects/<encoded-cwd>/<uuid>.jsonl
// with an optional sibling <uuid>/ sidecar directory.

import { readdir, readFile, stat, unlink, rm } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { spawn } from "node:child_process";
import * as readline from "node:readline/promises";

const HOME = homedir();
const ROOT = process.env.CLAUDE_PROJECTS_DIR ?? join(HOME, ".claude", "projects");
const HISTORY = join(HOME, ".claude", "history.jsonl");
const NOW = Date.now() / 1000;
const TTY_OUT = Boolean(process.stdout.isTTY);
const TTY_IN = Boolean(process.stdin.isTTY);

// Decorative glyphs fall back to ASCII when we suspect the terminal can't
// render them (classic Windows cmd.exe with cp949/cp1252 may "support" the
// codepoint but display it as mojibake). Heuristic: trust UTF-8 on
// Linux/macOS, and on Windows only when running inside Windows Terminal or
// an xterm-compatible TERM.
const UNICODE_OK =
  process.platform !== "win32" ||
  process.env.WT_SESSION !== undefined ||
  /^xterm|^screen|^tmux/.test(process.env.TERM ?? "");
const RULE = UNICODE_OK ? "─" : "-";
const ELL  = UNICODE_OK ? "…" : "...";

// --- Path encoding ---------------------------------------------------------

// Encode a cwd into Claude Code's project-directory name.
//   Linux/macOS:  /home/alice/.claude  -> -home-alice--claude
//   Windows:      C:\Users\alice       -> C--Users-alice
function encodePath(p: string): string {
  let s = p.replace(/\\/g, "/");
  // Git Bash form (/c/Users/alice) -> Windows form (C:/Users/alice).
  const gb = /^\/([a-zA-Z])(\/.*)?$/.exec(s);
  if (gb && (gb[2]?.length ?? 0) > 0) s = gb[1].toUpperCase() + ":" + (gb[2] ?? "");
  if (/^[a-zA-Z]:/.test(s)) s = s.replace(/:/g, "-");
  return s.replace(/\//g, "-").replace(/\./g, "-");
}

// Best-effort reverse for display only. Encoder is lossy ('/', '.', and on
// Windows ':' / '\\' all collapse to '-'), so this is a heuristic.
function decodeProject(enc: string): string {
  const m = /^([a-zA-Z])--(.*)$/.exec(enc);
  if (m) return `${m[1]}:/${m[2].replace(/-/g, "/")}`;
  return "/" + enc.replace(/^-/, "").replace(/-/g, "/");
}

// --- JSONL helpers ---------------------------------------------------------

// Parse JSONL once, extracting the fields we need in one pass:
// last `custom-title.customTitle`, first `last-prompt.lastPrompt`, first
// `cwd`, and the line count (= message count).
interface JsonlSummary {
  msgs: number;
  customTitle: string | null;
  lastPrompt: string | null;
  cwd: string | null;
}
async function summarizeJsonl(file: string): Promise<JsonlSummary> {
  let content: string;
  try { content = await readFile(file, "utf8"); }
  catch { return { msgs: 0, customTitle: null, lastPrompt: null, cwd: null }; }
  let msgs = 0;
  let customTitle: string | null = null;
  let lastPrompt: string | null = null;
  let cwd: string | null = null;
  for (const line of content.split("\n")) {
    if (!line) continue;
    msgs++;
    // Cheap pre-filter so we don't JSON.parse every record.
    if (!line.includes("custom-title") &&
        !line.includes("last-prompt") &&
        !line.includes('"cwd"')) continue;
    let r: any;
    try { r = JSON.parse(line); } catch { continue; }
    if (r.type === "custom-title" && r.customTitle) customTitle = r.customTitle;
    if (r.type === "last-prompt" && r.lastPrompt && lastPrompt === null) lastPrompt = r.lastPrompt;
    if (r.cwd && cwd === null) cwd = r.cwd;
  }
  return { msgs, customTitle, lastPrompt, cwd };
}

// --- history.jsonl ---------------------------------------------------------

// Build sessionId -> earliest-prompt map. The earliest .display per
// sessionId is what /resume shows.
const historyTitles = new Map<string, { ts: number; display: string }>();
let historyLoaded = false;
async function loadHistoryTitles(): Promise<void> {
  if (historyLoaded) return;
  historyLoaded = true;
  if (!existsSync(HISTORY)) return;
  let content: string;
  try { content = await readFile(HISTORY, "utf8"); } catch { return; }
  for (const line of content.split("\n")) {
    if (!line) continue;
    let r: any;
    try { r = JSON.parse(line); } catch { continue; }
    if (!r.sessionId || r.timestamp == null) continue;
    const ts = Number(r.timestamp);
    const cur = historyTitles.get(r.sessionId);
    if (!cur || ts < cur.ts) {
      historyTitles.set(r.sessionId, { ts, display: r.display ?? "" });
    }
  }
}

function titleFromHistory(sid: string): string | null {
  const e = historyTitles.get(sid);
  return e?.display || null;
}

// --- East Asian Width ------------------------------------------------------

// Treat CJK / fullwidth / supplementary ideograph ranges as width 2.
// Good enough for terminal alignment without pulling in a wcwidth library.
function charWidth(c: string): number {
  const cp = c.codePointAt(0) ?? 0;
  if (cp >= 0x1100 && cp <= 0x115F) return 2;       // Hangul Jamo
  if (cp >= 0x2E80 && cp <= 0xD7A3) return 2;       // CJK Radicals .. Hangul Syllables
  if (cp >= 0xF900 && cp <= 0xFAFF) return 2;       // CJK Compat Ideographs
  if (cp >= 0xFE30 && cp <= 0xFE4F) return 2;       // CJK Compat Forms
  if (cp >= 0xFF00 && cp <= 0xFF60) return 2;       // Fullwidth forms
  if (cp >= 0xFFE0 && cp <= 0xFFE6) return 2;
  if (cp >= 0x20000 && cp <= 0x2FFFD) return 2;     // CJK Extension B–F
  if (cp >= 0x30000 && cp <= 0x3FFFD) return 2;     // CJK Extension G
  return 1;
}

function vlen(s: string): number {
  let n = 0;
  for (const c of s) n += charWidth(c);
  return n;
}

function vtrunc(s: string, w: number): string {
  let used = 0, out = "";
  for (const c of s) {
    const cw = charWidth(c);
    if (used + cw > w) break;
    out += c; used += cw;
  }
  return out;
}

function vpad(s: string, w: number): string {
  const t = vtrunc(s, w);
  return t + " ".repeat(Math.max(0, w - vlen(t)));
}

function vrlefttrunc(s: string, w: number): string {
  if (vlen(s) <= w) return " ".repeat(w - vlen(s)) + s;
  const ew = vlen(ELL);
  let used = 0;
  const arr = [...s];
  const kept: string[] = [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const cw = charWidth(arr[i]);
    if (used + cw > w - ew) break;
    kept.unshift(arr[i]);
    used += cw;
  }
  return ELL + kept.join("") + " ".repeat(Math.max(0, w - used - ew));
}

// --- Display helpers -------------------------------------------------------

function reltime(t: number): string {
  const d = NOW - t;
  if (d < 0) return "future";
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}d ago`;
  // Match the bash version's local-date-only YYYY-MM-DD format.
  const dt = new Date(t * 1000);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// HOME can show up in several spellings depending on which side of the
// MSYS / native-Windows boundary we got it from. Generate every plausible
// variant so the '~' shortening still matches regardless of which side wins.
function homeForms(): string[] {
  const set = new Set<string>([HOME, HOME.replace(/\\/g, "/")]);
  const h = HOME.replace(/\\/g, "/");
  let m = /^\/([a-zA-Z])(\/.*)?$/.exec(h);
  if (m) {
    const d = m[1]; const rest = m[2] ?? "";
    set.add(d.toLowerCase() + ":" + rest);
    set.add(d.toUpperCase() + ":" + rest);
  }
  m = /^([a-zA-Z]):(\/.*)?$/.exec(h);
  if (m) {
    const d = m[1]; const rest = m[2] ?? "";
    set.add("/" + d.toLowerCase() + rest);
    set.add(d.toLowerCase() + ":" + rest);
    set.add(d.toUpperCase() + ":" + rest);
  }
  return [...set];
}

function shorten(p: string): string {
  // Encoder collapsed both '/' and '.' to '-', so '//' on decode is most
  // often where a '.' originally lived (e.g. '.claude').
  p = p.replace(/\/\//g, "/.");
  const homes = homeForms();
  for (const h of homes) {
    if (p === h) return "~";
    if (p.startsWith(h + "/")) return "~" + p.slice(h.length);
  }
  const pl = p.toLowerCase();
  for (const h of homes) {
    const hl = h.toLowerCase();
    if (pl === hl) return "~";
    if (pl.startsWith(hl + "/")) return "~" + p.slice(h.length);
  }
  return p;
}

const C = (code: string, s: string) => TTY_OUT ? `\x1b[${code}m${s}\x1b[0m` : s;
const dim  = (s: string) => C("2", s);
const bold = (s: string) => C("1", s);
const gray = (s: string) => C("38;5;245", s);
const cyan = (s: string) => C("36", s);

// --- Filesystem walks ------------------------------------------------------

async function listSessionFiles(here: boolean): Promise<string[]> {
  if (!existsSync(ROOT)) return [];
  const out: string[] = [];
  const dirs = here ? [join(ROOT, encodePath(process.cwd()))]
                    : (await readdir(ROOT)).map((d) => join(ROOT, d));
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const st = await stat(dir).catch(() => null);
    if (!st?.isDirectory()) continue;
    for (const name of await readdir(dir)) {
      if (name.endsWith(".jsonl")) out.push(join(dir, name));
    }
  }
  return out;
}

// --- Title resolution ------------------------------------------------------

interface ResolvedTitle { title: string; }
async function resolveTitle(file: string, summary?: JsonlSummary): Promise<ResolvedTitle> {
  const sid = basename(file, ".jsonl");
  const s = summary ?? await summarizeJsonl(file);
  const t = s.customTitle ?? titleFromHistory(sid) ?? s.lastPrompt ?? "(no prompt)";
  return { title: t.replace(/[\n\t]/g, "  ") };
}

// --- Resolver --------------------------------------------------------------

// Resolve a query to a single session .jsonl path. Tries UUID prefix first
// (only when the input is hex-only and >= 4 chars, so titles like "/review"
// or "auth" aren't misread as IDs), then case-insensitive title substring
// match against the same chain `list` uses.
async function resolveSession(query: string): Promise<string> {
  const allFiles = await listSessionFiles(false);

  let idMatches: string[] = [];
  if (query.length >= 4 && /^[0-9a-fA-F-]+$/.test(query)) {
    idMatches = allFiles.filter((f) => basename(f).startsWith(query));
    if (idMatches.length === 1) return idMatches[0];
  }

  await loadHistoryTitles();
  const ql = query.toLowerCase();
  const titleMatches: { file: string; sid: string; title: string }[] = [];
  for (const f of allFiles) {
    const sid = basename(f, ".jsonl");
    const summary = await summarizeJsonl(f);
    const t = summary.customTitle ?? titleFromHistory(sid) ?? summary.lastPrompt;
    if (!t) continue;
    if (t.toLowerCase().includes(ql)) titleMatches.push({ file: f, sid, title: t });
  }

  if (titleMatches.length === 1) return titleMatches[0].file;

  if (idMatches.length > 1 && titleMatches.length === 0) {
    process.stderr.write(`claude-session: '${query}' is ambiguous, matches:\n`);
    for (const f of idMatches) process.stderr.write(`  ${f}\n`);
    process.exit(1);
  }
  if (titleMatches.length > 1) {
    process.stderr.write(`claude-session: '${query}' is ambiguous, matches:\n`);
    for (const m of titleMatches) {
      process.stderr.write(`  ${m.sid.slice(0, 8)}  ${m.title}\n`);
    }
    process.exit(1);
  }
  process.stderr.write(`claude-session: no match for '${query}'\n`);
  process.exit(1);
}

// --- claude exec -----------------------------------------------------------

function execClaude(args: string[], cwd?: string): never {
  // spawn() with shell:false respects PATH on both Unix and Windows; on
  // Windows it also resolves .cmd/.exe variants when given a bare name.
  const child = spawn("claude", args, {
    cwd, stdio: "inherit",
    // Windows needs shell:true for PATHEXT resolution of `claude.cmd`.
    shell: process.platform === "win32",
  });
  child.on("error", (e) => {
    process.stderr.write(`claude-session: failed to exec claude: ${e.message}\n`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 0);
  });
  // Suppress TS no-return error.
  return new Promise<never>(() => {}) as never;
}

// --- Resume-mode picker ----------------------------------------------------

async function promptResumeMode(): Promise<string> {
  process.stderr.write("\nResume mode:\n  1) default\n  2) dangerously-skip-permissions\n");
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const ans = (await rl.question("Choice [1]: ")).trim() || "1";
  rl.close();
  return ans;
}

async function maybePickMode(extra: string[]): Promise<string[]> {
  if (extra.length > 0 || !TTY_IN) return extra;
  const choice = await promptResumeMode();
  if (choice === "1") return [];
  if (choice === "2") return ["--dangerously-skip-permissions"];
  process.stderr.write("claude-session: invalid resume-mode choice\n");
  process.exit(2);
}

// --- Commands --------------------------------------------------------------

async function cmdList(args: string[]) {
  let here = false;
  if (args[0] === "--here") here = true;
  else if (args.length > 0) {
    process.stderr.write(`claude-session list: unknown arg: ${args[0]}\n`);
    process.exit(2);
  }
  await loadHistoryTitles();
  const files = await listSessionFiles(here);
  if (files.length === 0) { console.log("(no sessions found)"); return; }

  type Row = { id8: string; mtime: number; msgs: number; project: string; title: string };
  const rows: Row[] = [];
  for (const f of files) {
    const fullId = basename(f, ".jsonl");
    const st = await stat(f);
    const summary = await summarizeJsonl(f);
    const { title } = await resolveTitle(f, summary);
    rows.push({
      id8: fullId.slice(0, 8),
      mtime: st.mtimeMs / 1000,
      msgs: summary.msgs,
      project: shorten(decodeProject(basename(dirname(f)))),
      title,
    });
  }
  rows.sort((a, b) => b.mtime - a.mtime);

  const ID_W = 8, MSGS_W = 5;
  const TIME_W = Math.max(8, ...rows.map((r) => reltime(r.mtime).length));
  const TERM_W = process.stdout.columns ?? 100;
  const SEP_W = 2 * 4; // 4 inter-column gaps of 2 spaces
  const remaining = Math.max(40, TERM_W - ID_W - TIME_W - MSGS_W - SEP_W);
  const TITLE_W = Math.max(20, Math.floor(remaining * 0.62));
  const PROJ_W = Math.max(10, remaining - TITLE_W);

  const line = (id: string, t: string, ti: string, m: string, p: string) =>
    `${id}  ${t}  ${ti}  ${m}  ${p}`;

  console.log(bold(line(
    vpad("ID", ID_W),
    vpad("MODIFIED", TIME_W),
    vpad("TITLE", TITLE_W),
    vpad("MSGS", MSGS_W),
    vpad("PROJECT", PROJ_W),
  )));
  console.log(dim(line(
    RULE.repeat(ID_W),
    RULE.repeat(TIME_W),
    RULE.repeat(TITLE_W),
    RULE.repeat(MSGS_W),
    RULE.repeat(PROJ_W),
  )));
  for (const r of rows) {
    console.log(line(
      gray(vpad(r.id8, ID_W)),
      dim(vpad(reltime(r.mtime), TIME_W)),
      vpad(r.title, TITLE_W),
      dim(String(r.msgs).padStart(MSGS_W)),
      cyan(vrlefttrunc(r.project, PROJ_W)),
    ));
  }
}

async function cmdStart(args: string[]) {
  // First positional (if not a flag) becomes the session name; without it
  // we just launch a plain `claude`. `claude --name <name>` is the CLI
  // equivalent of running `/rename <name>` once the session is up — both
  // set the display title shown in the /resume picker.
  const hasName = args.length > 0 && !args[0].startsWith("-");
  const name = hasName ? args[0] : undefined;
  const rest = hasName ? args.slice(1) : args;
  const extra = await maybePickMode(rest);
  execClaude(name ? ["--name", name, ...extra] : extra);
}

async function cmdResume(args: string[]) {
  const query = args[0];
  if (!query) {
    process.stderr.write("claude-session: resume requires <id-or-title>\n");
    process.exit(2);
  }
  const file = await resolveSession(query);
  const fullId = basename(file, ".jsonl");

  // The session's original cwd is in the JSONL itself. Decoding the
  // project directory name is lossy ('.' and '/' both collapse to '-'),
  // so the in-file `cwd` is the authoritative source.
  const summary = await summarizeJsonl(file);
  let cwd: string | undefined;
  if (summary.cwd && existsSync(summary.cwd)) cwd = summary.cwd;
  else if (summary.cwd) {
    process.stderr.write(`warning: session cwd '${summary.cwd}' no longer exists; resuming from ${process.cwd()}\n`);
  }

  const extra = await maybePickMode(args.slice(1));
  execClaude(["--resume", fullId, ...extra], cwd);
}

async function cmdDelete(args: string[]) {
  let force = false;
  const ids: string[] = [];
  for (const a of args) {
    if (a === "-f" || a === "--force") force = true;
    else if (a.startsWith("-")) {
      process.stderr.write(`claude-session: unknown flag: ${a}\n`);
      process.exit(2);
    } else ids.push(a);
  }
  if (ids.length === 0) {
    process.stderr.write("claude-session: delete requires <id>\n");
    process.exit(2);
  }

  const allFiles = await listSessionFiles(false);
  const toDelete: string[] = [];
  for (const id of ids) {
    if (id.length < 4) {
      process.stderr.write(`claude-session: id must be >= 4 chars: '${id}'\n`);
      process.exit(2);
    }
    const matches = allFiles.filter((f) => basename(f).startsWith(id));
    if (matches.length === 0) {
      process.stderr.write(`claude-session: no match for '${id}'\n`);
      process.exit(1);
    }
    if (matches.length > 1) {
      process.stderr.write(`claude-session: '${id}' is ambiguous, matches:\n`);
      for (const m of matches) process.stderr.write(`  ${m}\n`);
      process.exit(1);
    }
    toDelete.push(matches[0]);
  }

  console.log("About to delete:");
  for (const f of toDelete) {
    const sidecar = f.replace(/\.jsonl$/, "");
    console.log(`  ${f}`);
    if (existsSync(sidecar) && statSync(sidecar).isDirectory()) {
      console.log(`  ${sidecar}/  (sidecar)`);
    }
  }

  if (!force) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await rl.question("Proceed? [y/N] ");
    rl.close();
    if (!/^[Yy]/.test(ans.trim())) { console.log("aborted."); process.exit(1); }
  }

  for (const f of toDelete) {
    const sidecar = f.replace(/\.jsonl$/, "");
    await unlink(f);
    if (existsSync(sidecar) && statSync(sidecar).isDirectory()) {
      await rm(sidecar, { recursive: true, force: true });
    }
    console.log(`deleted ${basename(f, ".jsonl")}`);
  }
}

const USAGE = `claude-session — manage Claude Code session logs

Usage:
  claude-session list [--here]
  claude-session start [<name>] [-- claude-flags...]
  claude-session resume <id|title> [-- claude-flags...]
  claude-session delete <id> [<id>...] [-f|--force]
  claude-session help

Commands:
  list                  Show all sessions across projects, newest first.
                        --here   only sessions for the current directory.
  start [<name>] [args] Launch a new session. If <name> is given, sets it as
                        the display title (equivalent to \`/rename <name>\`
                        inside claude); otherwise launches plain \`claude\`.
                        With no args and a TTY, prompts:
                          1) default
                          2) dangerously-skip-permissions
                        Any args (besides <name>) are forwarded verbatim to
                        \`claude\` and bypass the prompt.
  resume <id|title>     Resume a session by UUID prefix (>= 4 hex chars) or by
        [args]          title (case-insensitive substring match against the
                        same title shown by \`list\`). Cd's into the session's
                        original project, then execs
                        \`claude --resume <uuid> [args]\`.
                        With no args and a TTY, prompts:
                          1) default
                          2) dangerously-skip-permissions
                        Any args after the query are forwarded verbatim to
                        \`claude\` and bypass the prompt.
  delete <id>           Delete by UUID or unique UUID prefix (>= 4 chars).
                        Removes the .jsonl AND its sidecar dir.
                        -f / --force  skip confirmation.
`;

async function main(args: string[]) {
  const sub = args[0] ?? "help";
  const rest = args.slice(1);
  switch (sub) {
    case "list":   await cmdList(rest); break;
    case "start":  await cmdStart(rest); break;
    case "resume": await cmdResume(rest); break;
    case "delete": await cmdDelete(rest); break;
    case "help":
    case "-h":
    case "--help":
    case undefined:
      process.stdout.write(USAGE); break;
    default:
      process.stderr.write(`claude-session: unknown command: ${sub}\n`);
      process.stdout.write(USAGE);
      process.exit(2);
  }
}

await main(process.argv.slice(2));
