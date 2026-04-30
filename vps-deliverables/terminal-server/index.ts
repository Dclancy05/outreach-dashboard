// terminal-server — persistent multi-terminal service for the dashboard.
//
// Runs on the VPS at port 10002. The dashboard's /agency/terminals page calls
// this to spawn detached tmux sessions; users connect via WebSocket to attach
// xterm.js to a tmux pane. Because tmux owns the actual TTY, sessions survive
// every form of client disconnect: closed laptop, killed browser tab, Vercel
// deploy, even a network outage. Reconnect = re-attach to the same tmux
// session, replay the scrollback, keep going.
//
// Endpoints:
//   POST   /sessions                  → create new session (returns id, ws_path)
//   GET    /sessions                  → list active sessions
//   DELETE /sessions/:id              → kill tmux + cleanup worktree
//   PATCH  /sessions/:id              → rename
//   POST   /sessions/:id/resize       → tell tmux the new viewport size
//   WS     /sessions/:id/stream       → bidirectional bytes ↔ tmux pane
//   GET    /healthz                   → 200 OK + count of active sessions
//
// Auth model:
//   - HTTP: `Authorization: Bearer ${TERMINAL_RUNNER_TOKEN}`
//   - WebSocket: same Bearer token, passed as `?token=...` query param since
//     browsers can't set custom headers on WS upgrades. Constant-time compare.
//
// Coordination (Phase 2 hooks — laid in but disabled until dashboard wires them):
//   - On create: row inserted into Supabase `terminal_sessions` so other
//     services + the activity feed can see the session
//   - On stream open: heartbeat updates `last_activity_at`
//   - On worktree dirty: `files_touched` array updated (TODO: wire git status)
//
// What this service deliberately does NOT do:
//   - Authentication of users (the dashboard does that, then calls us with a
//     shared bearer token; we trust the dashboard)
//   - Cost tracking of `claude` invocations (Claude Code reports its own cost
//     via JSONL stream, the dashboard parses; this service just runs tmux)
//   - Render terminal output (xterm.js does that in the browser)

import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { spawn, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { WebSocketServer, type WebSocket } from "ws"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const PORT = parseInt(process.env.PORT || "10002", 10)
const HOST = process.env.HOST || "127.0.0.1"
const TOKEN = process.env.TERMINAL_RUNNER_TOKEN || ""
// Where worktrees live. One subdir per session id. The repo root itself stays
// untouched — Dylan's main branch never has random commits from auto-spawned
// terminals.
const REPO_ROOT = process.env.REPO_ROOT || "/root/projects/outreach-dashboard"
const WORKTREE_ROOT = process.env.WORKTREE_ROOT || "/root/projects/wt"
// Default command each new tmux session runs. `claude` for the typical case,
// but Dylan can request a generic shell with `command: "/bin/bash"` in POST.
const DEFAULT_COMMAND = process.env.DEFAULT_TERMINAL_COMMAND || "/root/.local/bin/claude"
// Cap at 16 so a runaway script can't fork-bomb the box. Matches plan target.
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || "16", 10)

const SUPABASE_URL = process.env.SUPABASE_URL || ""
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

if (!TOKEN) {
  console.error("[terminal-server] refusing to start — TERMINAL_RUNNER_TOKEN not set")
  process.exit(1)
}
// tmux is a hard dependency. Refuse to start without it instead of failing
// confusingly on the first /sessions create.
const tmuxCheck = spawnSync("tmux", ["-V"])
if (tmuxCheck.status !== 0) {
  console.error("[terminal-server] tmux not installed — install with `apt install tmux`")
  process.exit(1)
}
if (!existsSync(WORKTREE_ROOT)) mkdirSync(WORKTREE_ROOT, { recursive: true })

let supa: SupabaseClient | null = null
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  console.log(`[terminal-server] supabase ready: ${SUPABASE_URL}`)
} else {
  console.warn("[terminal-server] SUPABASE_* missing — running stateless (sessions won't persist to DB)")
}

// ─── Session bookkeeping ────────────────────────────────────────────────────
//
// In-memory mirror of what's in tmux. Source of truth for "is this id valid"
// is `tmux has-session -t <id>` — we keep this map for fast list responses.
interface Session {
  id: string
  tmuxName: string
  worktreePath: string
  branch: string
  title: string
  command: string
  createdAt: number
  lastActivityAt: number
}
const sessions = new Map<string, Session>()

// ─── Helpers ───────────────────────────────────────────────────────────────

function tmuxName(id: string): string {
  // tmux session names can't contain dots or colons — sanitize aggressively.
  return `term-${id.replace(/[^a-zA-Z0-9]/g, "")}`
}

function tmuxHas(name: string): boolean {
  return spawnSync("tmux", ["has-session", "-t", name]).status === 0
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function authHttp(req: IncomingMessage): boolean {
  const h = req.headers["authorization"] || ""
  if (typeof h !== "string" || !h.startsWith("Bearer ")) return false
  return constantTimeEq(h.slice(7).trim(), TOKEN)
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = ""
  for await (const chunk of req) body += chunk
  return body
}

// ─── Worktree management ───────────────────────────────────────────────────

function makeWorktree(id: string): { path: string; branch: string } {
  const path = join(WORKTREE_ROOT, `sess-${id}`)
  const branch = `sess/${id}`
  // `git worktree add -b <branch> <path>` from main. Idempotent only if path
  // doesn't exist — we generate a fresh uuid so collisions don't happen.
  const r = spawnSync("git", ["worktree", "add", "-b", branch, path], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
  if (r.status !== 0) {
    throw new Error(`git worktree add failed: ${r.stderr || r.stdout}`)
  }
  return { path, branch }
}

function removeWorktree(path: string, branch: string): void {
  // `--force` because the worktree may have uncommitted state — Dylan still
  // wants to nuke it. The branch itself is preserved (so he can still merge
  // any committed work).
  spawnSync("git", ["worktree", "remove", "--force", path], { cwd: REPO_ROOT })
  // Don't delete the branch — that's Dylan's call. Branches sit cheaply.
  void branch
}

// ─── Supabase persistence (best-effort) ────────────────────────────────────

async function dbInsert(s: Session): Promise<void> {
  if (!supa) return
  await supa.from("terminal_sessions").insert({
    id: s.id,
    title: s.title,
    status: "running",
    branch: s.branch,
    worktree_path: s.worktreePath,
    created_at: new Date(s.createdAt).toISOString(),
    last_activity_at: new Date(s.lastActivityAt).toISOString(),
  }).then(({ error }) => {
    if (error) console.warn(`[terminal-server] db insert ${s.id} failed:`, error.message)
  })
}

async function dbUpdate(id: string, patch: Record<string, unknown>): Promise<void> {
  if (!supa) return
  await supa.from("terminal_sessions").update(patch).eq("id", id).then(({ error }) => {
    if (error) console.warn(`[terminal-server] db update ${id} failed:`, error.message)
  })
}

async function dbHeartbeat(id: string): Promise<void> {
  await dbUpdate(id, { last_activity_at: new Date().toISOString() })
}

// ─── Session lifecycle ─────────────────────────────────────────────────────

interface CreateInput {
  title?: string
  command?: string
  initial_prompt?: string  // optional: pipe this string into the new tmux pane
}

function createSession(input: CreateInput): Session {
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error(`Max ${MAX_SESSIONS} concurrent sessions reached`)
  }
  const id = randomUUID()
  const name = tmuxName(id)
  const { path, branch } = makeWorktree(id)
  const command = input.command || DEFAULT_COMMAND
  const title = input.title || `Terminal ${sessions.size + 1}`

  // tmux new-session -d (detached) creates a pane that survives every client
  // disconnect. -x/-y set initial size; xterm.js will resize-to-fit on attach.
  const r = spawnSync("tmux", [
    "new-session",
    "-d",
    "-s", name,
    "-x", "120",
    "-y", "30",
    "-c", path,
    command,
  ], { encoding: "utf8" })
  if (r.status !== 0) {
    removeWorktree(path, branch)
    throw new Error(`tmux new-session failed: ${r.stderr || r.stdout}`)
  }

  // Optional: pipe an initial prompt into the new pane. Useful when spawning
  // from Telegram /spawn so Claude starts working immediately.
  if (input.initial_prompt) {
    // send-keys with literal `-l` so meta-characters aren't interpreted, then
    // send-keys Enter so the line submits.
    spawnSync("tmux", ["send-keys", "-t", name, "-l", input.initial_prompt])
    spawnSync("tmux", ["send-keys", "-t", name, "Enter"])
  }

  const session: Session = {
    id,
    tmuxName: name,
    worktreePath: path,
    branch,
    title,
    command,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  }
  sessions.set(id, session)
  void dbInsert(session)
  console.log(`[terminal-server] session ${id} created: branch=${branch}`)
  return session
}

function killSession(id: string): boolean {
  const s = sessions.get(id)
  if (!s) return false
  spawnSync("tmux", ["kill-session", "-t", s.tmuxName])
  removeWorktree(s.worktreePath, s.branch)
  sessions.delete(id)
  void dbUpdate(id, { status: "stopped", finished_at: new Date().toISOString() })
  console.log(`[terminal-server] session ${id} killed`)
  return true
}

// ─── HTTP routing ──────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  // CORS — the dashboard origin will hit us cross-origin via Tailscale Funnel.
  // We don't know the exact origin (preview deploys vary), so reflect it back.
  // This service is auth-gated by Bearer token, so a permissive CORS is fine.
  const origin = (req.headers.origin as string | undefined) || "*"
  res.setHeader("access-control-allow-origin", origin)
  res.setHeader("access-control-allow-credentials", "true")
  res.setHeader("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS")
  res.setHeader("access-control-allow-headers", "authorization, content-type")
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return }

  const url = req.url || ""

  if (req.method === "GET" && url === "/healthz") {
    sendJson(res, 200, { ok: true, sessions: sessions.size, ts: new Date().toISOString() })
    return
  }

  if (!authHttp(req)) {
    sendJson(res, 401, { error: "unauthorized" })
    return
  }

  // POST /sessions
  if (req.method === "POST" && url === "/sessions") {
    let input: CreateInput = {}
    try { input = JSON.parse(await readBody(req)) } catch { /* empty body ok */ }
    try {
      const s = createSession(input)
      sendJson(res, 200, {
        id: s.id,
        title: s.title,
        branch: s.branch,
        worktree_path: s.worktreePath,
        created_at: new Date(s.createdAt).toISOString(),
        ws_path: `/sessions/${s.id}/stream`,
      })
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message })
    }
    return
  }

  // GET /sessions
  if (req.method === "GET" && url === "/sessions") {
    const out = Array.from(sessions.values()).map((s) => ({
      id: s.id,
      title: s.title,
      branch: s.branch,
      worktree_path: s.worktreePath,
      command: s.command,
      created_at: new Date(s.createdAt).toISOString(),
      last_activity_at: new Date(s.lastActivityAt).toISOString(),
      tmux_attached: tmuxHas(s.tmuxName),
    }))
    sendJson(res, 200, { sessions: out })
    return
  }

  // /sessions/:id...
  const m = url.match(/^\/sessions\/([^/?]+)(?:\?.*)?(\/[^?]*)?$/)
  if (m) {
    const [, id, sub] = m
    if (req.method === "DELETE" && !sub) {
      sendJson(res, killSession(id) ? 200 : 404, killSession(id) ? { ok: true } : { error: "not_found" })
      return
    }
    if (req.method === "PATCH" && !sub) {
      let input: { title?: string } = {}
      try { input = JSON.parse(await readBody(req)) } catch { /* */ }
      const s = sessions.get(id)
      if (!s) { sendJson(res, 404, { error: "not_found" }); return }
      if (input.title) {
        s.title = input.title
        await dbUpdate(id, { title: input.title })
      }
      sendJson(res, 200, { ok: true, title: s.title })
      return
    }
    if (req.method === "POST" && sub === "/resize") {
      let input: { cols?: number; rows?: number } = {}
      try { input = JSON.parse(await readBody(req)) } catch { /* */ }
      const s = sessions.get(id)
      if (!s) { sendJson(res, 404, { error: "not_found" }); return }
      const cols = Math.max(20, Math.min(500, input.cols || 80))
      const rows = Math.max(5, Math.min(200, input.rows || 24))
      // refresh-client only resizes the attached client window in tmux's view;
      // for unattached panes we set the explicit pane size with `resize-window`.
      spawnSync("tmux", ["resize-window", "-t", s.tmuxName, "-x", String(cols), "-y", String(rows)])
      sendJson(res, 200, { ok: true, cols, rows })
      return
    }
  }

  sendJson(res, 404, { error: "not_found" })
})

// ─── WebSocket upgrade — bridge xterm.js ↔ tmux pane ──────────────────────
//
// The browser opens `wss://.../sessions/<id>/stream?token=<bearer>`. We:
//   1. Validate the bearer token (constant-time)
//   2. Pipe scrollback (last ~1000 lines from tmux's history) so the user
//      sees prior output immediately on reconnect
//   3. Spawn `tmux pipe-pane -o -t <session> 'cat'` to capture pane output
//   4. Use `tmux send-keys` to inject incoming WS messages as user input
//
// This is simpler than node-pty + tmux attach-session because we don't need
// to multiplex client redraws — tmux already handles that. We're effectively
// a thin bytestream proxy.

const wss = new WebSocketServer({ noServer: true })

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`)
  const m = url.pathname.match(/^\/sessions\/([^/]+)\/stream$/)
  if (!m) { socket.destroy(); return }
  const id = m[1]
  const token = url.searchParams.get("token") || ""
  if (!constantTimeEq(token, TOKEN)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
    socket.destroy()
    return
  }
  const s = sessions.get(id)
  if (!s || !tmuxHas(s.tmuxName)) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n")
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => attachToSession(ws, s))
})

function attachToSession(ws: WebSocket, s: Session): void {
  s.lastActivityAt = Date.now()

  // 1. Replay scrollback. `capture-pane -p -S -1000` prints the last 1000
  //    lines including history. Send as one chunk; xterm.js handles wrapping.
  const cap = spawnSync("tmux", ["capture-pane", "-p", "-J", "-S", "-1000", "-t", s.tmuxName], {
    encoding: "utf8",
  })
  if (cap.status === 0 && cap.stdout) {
    try { ws.send(cap.stdout) } catch { /* client may have already closed */ }
  }

  // 2. Live tail. `pipe-pane -o` toggles the pipe — running it twice would
  //    detach. We always start a fresh pipe per WS connection by piping to a
  //    new `cat` process; closing this WS terminates the cat, freeing tmux.
  const tail = spawn("tmux", ["pipe-pane", "-o", "-t", s.tmuxName, "cat"], {
    stdio: ["ignore", "pipe", "pipe"],
  })
  tail.stdout.on("data", (chunk: Buffer) => {
    if (ws.readyState === ws.OPEN) ws.send(chunk)
  })

  // 3. Forward client input → tmux send-keys. We chunk on each WS message;
  //    `-l` (literal) prevents tmux from interpreting our bytes as command
  //    sequences, which means special keys (arrow, ctrl-c, etc.) flow through
  //    as their raw escape codes from xterm.js.
  ws.on("message", (data) => {
    s.lastActivityAt = Date.now()
    void dbHeartbeat(s.id)
    const text = typeof data === "string" ? data : (data as Buffer).toString("binary")
    spawnSync("tmux", ["send-keys", "-t", s.tmuxName, "-l", text])
  })

  ws.on("close", () => {
    // Stop the pipe-pane. -O means "don't open a new one"; running pipe-pane
    // without -O would re-toggle and silently re-enable capture.
    spawnSync("tmux", ["pipe-pane", "-O", "-t", s.tmuxName])
    try { tail.kill() } catch { /* already gone */ }
  })

  ws.on("error", (err) => {
    console.warn(`[terminal-server] ws error on ${s.id}:`, err.message)
  })
}

// ─── Boot ──────────────────────────────────────────────────────────────────

server.listen(PORT, HOST, () => {
  console.log(`[terminal-server] listening on ${HOST}:${PORT}`)
  console.log(`  worktrees: ${WORKTREE_ROOT}`)
  console.log(`  default cmd: ${DEFAULT_COMMAND}`)
  console.log(`  max sessions: ${MAX_SESSIONS}`)
  console.log(`  supabase: ${supa ? "configured" : "missing (stateless)"}`)
})

// Graceful shutdown — kill all tmux sessions on SIGTERM so a redeploy doesn't
// leak orphaned panes. Worktrees stay (branches preserved); operator can
// `git worktree prune` later if needed.
function shutdown() {
  console.log("[terminal-server] shutting down — killing all tmux sessions")
  for (const s of sessions.values()) {
    spawnSync("tmux", ["kill-session", "-t", s.tmuxName])
  }
  sessions.clear()
  server.close(() => process.exit(0))
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
