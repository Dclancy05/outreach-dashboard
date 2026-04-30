// terminal-server — persistent multi-terminal service for the dashboard.
//
// Runs on the VPS at port 10002. The dashboard's /agency/terminals page calls
// this to spawn detached tmux sessions; the browser connects via WebSocket to
// attach xterm.js to a tmux pane. Sessions survive every form of client
// disconnect: closed laptop, killed browser tab, Vercel deploy, network drop,
// even a service restart (we rehydrate from `tmux ls` on boot).
//
// Architecture (post-Phase-A rewrite):
//
//   Browser xterm.js  ──ws──►  this Node service  ──node-pty──►  tmux attach-session
//                                                                          │
//                                                                          ▼
//                                                                   tmux session
//                                                                   running claude
//                                                                   in a worktree
//
// The flawed Phase-1 approach was `tmux pipe-pane -o ... cat` to capture
// output and `tmux send-keys -l` per keystroke for input. That's broken: the
// `cat` runs as a child of the tmux server (not Node), so output never reaches
// the WS, and input does fork+exec per character. The standard fix — used by
// ttyd, wetty, code-server, vscode tunnels — is one bidirectional PTY per WS
// client (via node-pty), running `tmux attach-session`. Tmux handles
// scrollback replay automatically on attach; multi-attach is tmux-native;
// closing the WS just detaches (session keeps running). See plan in
// /root/.claude/plans/ok-can-you-deep-flickering-rocket.md
//
// Endpoints:
//   POST   /sessions                  → create
//   GET    /sessions                  → list (also reconciles in-memory map vs tmux ls)
//   DELETE /sessions/:id              → kill tmux + cleanup worktree
//   PATCH  /sessions/:id              → rename
//   POST   /sessions/:id/resize       → tmux resize-window
//   WS     /sessions/:id/stream       → bidirectional bytes ↔ tmux pane
//   GET    /healthz                   → unauthed liveness check
//
// Auth model:
//   - HTTP: `Authorization: Bearer ${TERMINAL_RUNNER_TOKEN}`
//   - WebSocket: `Sec-WebSocket-Protocol: bearer.<TOKEN>`. Browsers can't
//     set custom headers on WS upgrades, but they CAN set subprotocols, which
//     ride in a header — so the token never lands in the URL (and therefore
//     never in Tailscale Funnel access logs). Constant-time compare.
//
// Coordination hooks (Phase C wires up writers; this file logs the data shape):
//   - On create / heartbeat: row in Supabase `terminal_sessions`
//   - Phase C: per-session SIBLINGS.md writer in each worktree's CLAUDE.md
//   - Phase B: cost watcher updates `cost_usd` from claude's stdout markers
//
// What this service deliberately does NOT do:
//   - Authenticate users (the dashboard PIN-gates /api/terminals/*)
//   - Render terminal output (xterm.js does that)
//   - Track Claude tokens (Phase B does — separate watcher loop)

import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { spawn, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { WebSocketServer, type WebSocket } from "ws"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import * as pty from "node-pty"

// Strip anything that isn't [a-zA-Z0-9_-] from a string before putting it in a
// log line. Defends against log-injection — even though our ids are UUIDs in
// practice, any path that lets a request body's value reach a log call is a
// CodeQL hit, so we sanitize at the boundary.
function safe(s: unknown): string {
  if (typeof s !== "string") return String(s)
  return s.replace(/[^a-zA-Z0-9_-]/g, "")
}

const PORT = parseInt(process.env.PORT || "10002", 10)
const HOST = process.env.HOST || "127.0.0.1"
const TOKEN = process.env.TERMINAL_RUNNER_TOKEN || ""
const REPO_ROOT = process.env.REPO_ROOT || "/root/projects/outreach-dashboard"
const WORKTREE_ROOT = process.env.WORKTREE_ROOT || "/root/projects/wt"
const DEFAULT_COMMAND = process.env.DEFAULT_TERMINAL_COMMAND || "/root/.local/bin/claude"
// Hard cap. The dashboard ALSO has a soft, VPS-aware cap (computed from
// /proc/meminfo) — see vpsConcurrencyCap() — but we keep an absolute hard
// cap here as a last-resort guard.
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || "8", 10)

const SUPABASE_URL = process.env.SUPABASE_URL || ""
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

// Path to the tmux conf we ship next to this file. -f points tmux at it
// instead of the default ~/.tmux.conf so our 50k-line scrollback +
// destroy-unattached settings always apply, regardless of who runs the
// service.
const HERE = dirname(fileURLToPath(import.meta.url))
const TMUX_CONF_PATH = process.env.TMUX_CONF_PATH || join(HERE, "tmux.conf")
const BOOTSTRAP_SCRIPT = process.env.TERMINAL_BOOTSTRAP_SCRIPT || join(HERE, "agent-bootstrap.sh")

if (!TOKEN) {
  console.error("[terminal-server] refusing to start — TERMINAL_RUNNER_TOKEN not set")
  process.exit(1)
}
const tmuxCheck = spawnSync("tmux", ["-V"])
if (tmuxCheck.status !== 0) {
  console.error("[terminal-server] tmux not installed — install with `apt install tmux`")
  process.exit(1)
}
if (!existsSync(WORKTREE_ROOT)) mkdirSync(WORKTREE_ROOT, { recursive: true })
if (!existsSync(TMUX_CONF_PATH)) {
  console.warn(`[terminal-server] tmux.conf not found at ${safe(TMUX_CONF_PATH)} — using tmux defaults (scrollback will be limited to 2000 lines)`)
}
if (!existsSync(BOOTSTRAP_SCRIPT)) {
  console.warn(`[terminal-server] bootstrap script not found at ${safe(BOOTSTRAP_SCRIPT)} — sessions will run unconfined (no memory cap)`)
}

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

interface Session {
  id: string
  tmuxName: string
  worktreePath: string
  branch: string
  title: string
  command: string
  createdAt: number
  lastActivityAt: number
  /** Set true when DELETE is called so the crash-watcher (Phase B) doesn't
   *  treat a graceful kill as a crash and respawn it. */
  pendingKill?: boolean
}
const sessions = new Map<string, Session>()

// ─── Helpers ───────────────────────────────────────────────────────────────

function tmuxName(id: string): string {
  return `term-${id.replace(/[^a-zA-Z0-9]/g, "")}`
}

function tmuxIdFromName(name: string): string | null {
  const m = name.match(/^term-([a-fA-F0-9]+)$/)
  return m ? m[1] : null
}

function tmuxHas(name: string): boolean {
  return spawnSync("tmux", ["-f", TMUX_CONF_PATH, "has-session", "-t", name]).status === 0
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
  const r = spawnSync("git", ["worktree", "add", "-b", branch, path], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
  if (r.status !== 0) {
    throw new Error(`git worktree add failed: ${r.stderr || r.stdout}`)
  }
  return { path, branch }
}

/**
 * Remove a worktree. Pass `deleteBranch=true` to also wipe the session branch
 * — used on rollback (createSession failed, no work to preserve). The default
 * keeps the branch so an operator can still inspect committed work after a
 * graceful kill.
 */
function removeWorktree(path: string, branch: string, deleteBranch: boolean = false): void {
  spawnSync("git", ["worktree", "remove", "--force", path], { cwd: REPO_ROOT })
  if (deleteBranch) {
    spawnSync("git", ["branch", "-D", branch], { cwd: REPO_ROOT })
  }
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
    if (error) console.warn("[terminal-server] db insert failed", { id: safe(s.id), err: error.message })
  })
}

async function dbUpdate(id: string, patch: Record<string, unknown>): Promise<void> {
  if (!supa) return
  await supa.from("terminal_sessions").update(patch).eq("id", id).then(({ error }) => {
    if (error) console.warn("[terminal-server] db update failed", { id: safe(id), err: error.message })
  })
}

async function dbHeartbeat(id: string): Promise<void> {
  await dbUpdate(id, { last_activity_at: new Date().toISOString() })
}

// ─── Boot rehydrate ────────────────────────────────────────────────────────
//
// The in-memory `sessions` Map is volatile — it dies with the Node process.
// But the tmux sessions on disk survive systemd restarts. On boot we list
// `tmux ls`, find any session whose name matches our `term-<uuid>` pattern,
// and re-register it in the Map. We pull title/branch metadata from Supabase
// when available; otherwise fall back to placeholder values.
//
// Without this, a `systemctl restart terminal-server` would orphan every
// running terminal — they'd still be alive on the box but invisible to the
// dashboard. Major Phase-1 bug.

async function rehydrateOnBoot(): Promise<number> {
  const r = spawnSync("tmux", ["-f", TMUX_CONF_PATH, "list-sessions", "-F", "#{session_name}"], { encoding: "utf8" })
  if (r.status !== 0) {
    // No tmux server running yet — that's fine, just means zero sessions.
    return 0
  }
  const names = r.stdout.split("\n").filter((n) => n.startsWith("term-"))
  if (names.length === 0) return 0

  // Pull metadata from Supabase in one shot, indexed by id.
  const meta: Map<string, { title?: string; branch?: string; worktree_path?: string; created_at?: string; last_activity_at?: string }> = new Map()
  if (supa) {
    const { data } = await supa.from("terminal_sessions")
      .select("id,title,branch,worktree_path,created_at,last_activity_at")
      .in("status", ["running", "starting", "idle", "crashed"])
    for (const row of data || []) {
      meta.set((row as { id: string }).id, row as { id: string; title?: string; branch?: string; worktree_path?: string; created_at?: string; last_activity_at?: string })
    }
  }

  let adopted = 0
  for (const name of names) {
    const id = tmuxIdFromName(name)
    if (!id) continue
    const m = meta.get(id) || {}
    // Reconstruct the session record. Worktree path / branch fall back to
    // conventional paths if Supabase is missing the row.
    const session: Session = {
      id,
      tmuxName: name,
      worktreePath: m.worktree_path || join(WORKTREE_ROOT, `sess-${id}`),
      branch: m.branch || `sess/${id}`,
      title: m.title || `Terminal (rehydrated)`,
      command: DEFAULT_COMMAND,
      createdAt: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
      lastActivityAt: m.last_activity_at ? new Date(m.last_activity_at).getTime() : Date.now(),
    }
    sessions.set(id, session)
    if (supa) {
      void dbUpdate(id, { status: "running", last_activity_at: new Date().toISOString() })
    }
    adopted += 1
  }
  console.log(`[terminal-server] rehydrate: adopted ${adopted} existing tmux session(s)`)
  return adopted
}

// ─── Session lifecycle ─────────────────────────────────────────────────────

interface CreateInput {
  title?: string
  command?: string
  initial_prompt?: string
}

function createSession(input: CreateInput): Session {
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error(`Max ${MAX_SESSIONS} concurrent sessions reached`)
  }
  const id = randomUUID()
  const name = tmuxName(id)
  const command = input.command || DEFAULT_COMMAND
  const title = input.title || `Terminal ${sessions.size + 1}`

  let worktree: { path: string; branch: string } | null = null
  try {
    worktree = makeWorktree(id)

    // Build the tmux args. We always pass -f to use our scrollback config.
    // The pane's command is wrapped in agent-bootstrap.sh (which adds
    // systemd-run / prlimit memory caps).
    const tmuxArgs = [
      "-f", TMUX_CONF_PATH,
      "new-session",
      "-d",
      "-s", name,
      "-x", "120",
      "-y", "30",
      "-c", worktree.path,
    ]
    if (existsSync(BOOTSTRAP_SCRIPT)) {
      tmuxArgs.push(BOOTSTRAP_SCRIPT, command)
    } else {
      tmuxArgs.push(command)
    }
    const r = spawnSync("tmux", tmuxArgs, { encoding: "utf8" })
    if (r.status !== 0) {
      throw new Error(`tmux new-session failed: ${r.stderr || r.stdout}`)
    }

    if (input.initial_prompt) {
      // -l = literal, so meta-characters in the prompt aren't interpreted.
      spawnSync("tmux", ["-f", TMUX_CONF_PATH, "send-keys", "-t", name, "-l", input.initial_prompt])
      spawnSync("tmux", ["-f", TMUX_CONF_PATH, "send-keys", "-t", name, "Enter"])
    }

    const session: Session = {
      id,
      tmuxName: name,
      worktreePath: worktree.path,
      branch: worktree.branch,
      title,
      command,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    }
    sessions.set(id, session)
    void dbInsert(session)
    console.log("[terminal-server] session created", { id: safe(id), branch: safe(worktree.branch) })
    return session
  } catch (e) {
    // Rollback: nuke the worktree AND the branch so the repo doesn't
    // accumulate orphan branches on every failed spawn.
    if (worktree) {
      removeWorktree(worktree.path, worktree.branch, true)
    }
    throw e
  }
}

function killSession(id: string): boolean {
  const s = sessions.get(id)
  if (!s) return false
  s.pendingKill = true
  spawnSync("tmux", ["-f", TMUX_CONF_PATH, "kill-session", "-t", s.tmuxName])
  // Keep the branch — Dylan can still merge committed work.
  removeWorktree(s.worktreePath, s.branch, false)
  sessions.delete(id)
  void dbUpdate(id, { status: "stopped", finished_at: new Date().toISOString() })
  console.log("[terminal-server] session killed", { id: safe(id) })
  return true
}

// ─── HTTP routing ──────────────────────────────────────────────────────────

// Origins allowed to call this service from a browser. Suffix-match was the
// original Phase-1 approach but `*.vercel.app` is too permissive — any user
// running a Vercel preview deploy could hit us if they had the token. We
// pin to known production hosts and let operators add more via env.
const ALLOWED_ORIGINS = new Set<string>([
  "https://outreach-github.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
])
function originAllowed(origin: string | undefined): boolean {
  if (!origin) return false
  return ALLOWED_ORIGINS.has(origin)
}

const server = createServer(async (req, res) => {
  const origin = (req.headers.origin as string | undefined) || ""
  if (originAllowed(origin)) {
    res.setHeader("access-control-allow-origin", origin)
    res.setHeader("vary", "origin")
    res.setHeader("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS")
    res.setHeader("access-control-allow-headers", "authorization, content-type")
  }
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
    // Reconcile in case a tmux session died between the last poll and now.
    for (const [id, s] of sessions) {
      if (!tmuxHas(s.tmuxName)) {
        sessions.delete(id)
        void dbUpdate(id, { status: "stopped", finished_at: new Date().toISOString() })
      }
    }
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
  const m = url.match(/^\/sessions\/([^/?]+)(\/[^?]*)?(?:\?.*)?$/)
  if (m) {
    const id = m[1]
    const sub = m[2]
    if (req.method === "DELETE" && !sub) {
      // Single call — Phase-1 bug was calling killSession twice in the
      // ternary expression, which always returned 404 even on success.
      const ok = killSession(id)
      sendJson(res, ok ? 200 : 404, ok ? { ok: true } : { error: "not_found" })
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
      spawnSync("tmux", ["-f", TMUX_CONF_PATH, "resize-window", "-t", s.tmuxName, "-x", String(cols), "-y", String(rows)])
      sendJson(res, 200, { ok: true, cols, rows })
      return
    }
  }

  sendJson(res, 404, { error: "not_found" })
})

// ─── WebSocket bridge — node-pty ↔ tmux attach-session ────────────────────
//
// The standard architecture from ttyd / wetty / code-server. For each WS
// connection we spawn a fresh `tmux attach-session` under node-pty, which
// gives us a real bidirectional PTY. tmux automatically replays the
// scrollback to the attaching client (no separate replay step needed) and
// supports many concurrent attaches (multi-tab works for free).
//
// Token auth happens on the upgrade. Browsers can't set custom headers on
// WS, but they CAN set subprotocols, which ride in the Sec-WebSocket-
// Protocol header — and headers don't leak into Tailscale Funnel access
// logs the way query strings do. We accept the format `bearer.<TOKEN>`
// and echo the literal subprotocol string back on accept.

// `handleProtocols` is called by `ws` during the upgrade. We accept any
// subprotocol that starts with `bearer.` and matches our token; the value we
// return is echoed back as the `Sec-WebSocket-Protocol` response header,
// which Chrome/Firefox require for `new WebSocket(url, [protocols])` to
// succeed.
const wss = new WebSocketServer({
  noServer: true,
  handleProtocols: (protocols: Set<string>) => {
    for (const p of protocols) {
      if (p.startsWith("bearer.")) {
        const tok = p.slice("bearer.".length)
        if (constantTimeEq(tok, TOKEN)) return p
      }
    }
    return false
  },
})

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`)
  const m = url.pathname.match(/^\/sessions\/([^/]+)\/stream$/)
  if (!m) { socket.destroy(); return }
  const id = m[1]
  // Pre-flight the bearer check before allocating ws state. handleProtocols
  // also enforces this, but rejecting earlier means a bad token gets a clean
  // 401 instead of an opaque handshake failure.
  const raw = req.headers["sec-websocket-protocol"]
  let okAuth = false
  if (typeof raw === "string") {
    for (const p of raw.split(",").map((s) => s.trim())) {
      if (p.startsWith("bearer.") && constantTimeEq(p.slice("bearer.".length), TOKEN)) {
        okAuth = true
        break
      }
    }
  }
  if (!okAuth) {
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
  void dbHeartbeat(s.id)

  // One bridge PTY per WS client. tmux attach-session replays scrollback
  // automatically to the attaching client. Closing the WS kills the
  // bridge; the underlying tmux session keeps running for reconnects.
  let bridge: pty.IPty
  try {
    // node-pty's env type is `{ [key: string]: string }` (no undefined). Filter
    // process.env so undefined values don't leak in.
    const env: { [key: string]: string } = { TERM: "xterm-256color" }
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === "string") env[k] = v
    }
    bridge = pty.spawn("tmux", ["-f", TMUX_CONF_PATH, "attach-session", "-t", s.tmuxName], {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: s.worktreePath,
      env,
    })
  } catch (e) {
    console.warn("[terminal-server] pty spawn failed", { id: safe(s.id), err: (e as Error).message })
    try { ws.close(1011, "pty spawn failed") } catch { /* */ }
    return
  }

  // Output: pty → ws
  const dataSub = bridge.onData((data: string) => {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(data) } catch { /* client gone, will be cleaned up below */ }
    }
  })

  const exitSub = bridge.onExit(() => {
    // tmux attach exits when the user presses C-b d (detach), or when the
    // tmux session itself dies. In either case the WS should close — the
    // browser will reconnect and we'll re-attach.
    try { ws.close(1000, "pty exited") } catch { /* */ }
  })

  // Input: ws → pty
  ws.on("message", (data, isBinary) => {
    s.lastActivityAt = Date.now()
    void dbHeartbeat(s.id)
    try {
      if (isBinary) {
        bridge.write((data as Buffer).toString("binary"))
      } else {
        bridge.write(typeof data === "string" ? data : (data as Buffer).toString("utf8"))
      }
    } catch (e) {
      console.warn("[terminal-server] pty write failed", { id: safe(s.id), err: (e as Error).message })
    }
  })

  ws.on("close", () => {
    dataSub.dispose()
    exitSub.dispose()
    try { bridge.kill() } catch { /* */ }
  })

  ws.on("error", (err) => {
    console.warn("[terminal-server] ws error", { id: safe(s.id), err: err.message })
  })
}

// ─── Boot ──────────────────────────────────────────────────────────────────

server.listen(PORT, HOST, async () => {
  console.log(`[terminal-server] listening on ${HOST}:${PORT}`)
  console.log(`  worktrees: ${WORKTREE_ROOT}`)
  console.log(`  default cmd: ${DEFAULT_COMMAND}`)
  console.log(`  max sessions: ${MAX_SESSIONS}`)
  console.log(`  tmux conf: ${TMUX_CONF_PATH}`)
  console.log(`  bootstrap: ${BOOTSTRAP_SCRIPT}`)
  console.log(`  supabase: ${supa ? "configured" : "missing (stateless)"}`)
  try {
    await rehydrateOnBoot()
  } catch (e) {
    console.warn("[terminal-server] rehydrate failed:", (e as Error).message)
  }
})

// Graceful shutdown — DON'T kill tmux sessions. The whole point of this
// service is that sessions survive systemd restarts; killing them on SIGTERM
// would defeat persistence across redeploys. We just close the HTTP/WS
// server; tmux sessions stay alive and rehydrate on next boot.
function shutdown() {
  console.log("[terminal-server] shutting down — tmux sessions left alive for next boot to rehydrate")
  server.close(() => process.exit(0))
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
