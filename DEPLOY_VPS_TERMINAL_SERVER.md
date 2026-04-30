# Deploy — Terminal Server (Persistent Multi-Terminal Workspace)

The `/agency/terminals` page in the dashboard expects a Node service running
on the VPS at port 10002 named `terminal-server`. This service spawns
detached `tmux` sessions per terminal, exposes HTTP for create/list/kill,
and a WebSocket for byte-stream attach (xterm.js ↔ tmux pane).

Source lives at `vps-deliverables/terminal-server/`. Copy it up, install
deps, register a systemd unit, expose it via Tailscale Funnel, and you're
done.

## Prerequisites

- VPS already has Node 18+ and `git` installed (it does — agent-runner uses both).
- `tmux` installed: `apt install -y tmux`. Without this the service refuses to start.
- Build toolchain for `node-pty`'s native module: `apt install -y make g++ python3`.
  (Hostinger's Ubuntu image usually has these but it's not guaranteed.)
- The dashboard repo cloned at `/root/projects/outreach-dashboard` (used as the
  base for git worktrees the service creates per session).
- `claude` CLI installed somewhere on the VPS. Run `which claude` — typical
  locations are `/root/.local/bin/claude` or `/usr/local/bin/claude`. Whatever
  you find, set `DEFAULT_TERMINAL_COMMAND` in the systemd unit below.

## One-time setup: Supabase access token (so future migrations are auto)

Without this, `scripts/deploy-terminals.sh` falls back to opening the Supabase
SQL editor in your browser and asking you to paste. With it, migrations apply
fully automatically over HTTPS.

1. Open https://supabase.com/dashboard/account/tokens
2. Click **Generate new token**, name it `claude-deploy`
3. Copy the `sbp_...` value
4. Save it to either of:
   - `~/.supabase-access-token` (file) — `echo "sbp_xxx" > ~/.supabase-access-token && chmod 600 ~/.supabase-access-token`
   - Vercel project env var `SUPABASE_ACCESS_TOKEN` — `vercel env add SUPABASE_ACCESS_TOKEN production` (then re-run `vercel env pull .env.vercel.prod`)

Both work; the home-dir file is simpler and doesn't pollute your Vercel env.

## Deploy steps

Run from your local machine.

```bash
# 1. Copy the service up
scp -r vps-deliverables/terminal-server \
  root@srv1197943.hstgr.cloud:/opt/terminal-server

# 2. SSH in and install
ssh root@srv1197943.hstgr.cloud
apt install -y tmux make g++ python3
cd /opt/terminal-server
chmod +x agent-bootstrap.sh
npm install      # compiles node-pty native module — takes ~30s

# Verify claude path; remember it for the systemd unit below
which claude

# 3. Generate a bearer token (any 32+ char random string)
TOKEN=$(openssl rand -hex 24)
echo "TOKEN=$TOKEN"
# ⬆️ paste this into the dashboard's API Keys tab as TERMINAL_RUNNER_TOKEN

# 4. Create the systemd unit
cat > /etc/systemd/system/terminal-server.service <<EOF
[Unit]
Description=Terminal Server (persistent multi-terminal for the dashboard)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/terminal-server
Environment=PORT=10002
Environment=HOST=127.0.0.1
Environment=TERMINAL_RUNNER_TOKEN=$TOKEN
Environment=REPO_ROOT=/root/projects/outreach-dashboard
Environment=WORKTREE_ROOT=/root/projects/wt
Environment=DEFAULT_TERMINAL_COMMAND=/root/.local/bin/claude
Environment=MAX_SESSIONS=8
# Per-session resource caps (the bootstrap script enforces these via
# systemd-run --scope on cgroup v2). 1G RAM + 2 cores is enough for
# claude with reasonable thinking budgets.
Environment=TERMINAL_MEM_LIMIT=1G
Environment=TERMINAL_CPU_QUOTA=200%
# Optional — same Supabase creds the agent-runner already uses
EnvironmentFile=-/etc/terminal-server.env
ExecStart=/usr/bin/npx tsx index.ts
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# 5. Add Supabase env (same values agent-runner uses)
cat > /etc/terminal-server.env <<EOF
SUPABASE_URL=https://yfufocegjhxxffqtkvkr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<paste service role key here>
EOF
chmod 600 /etc/terminal-server.env

# 6. Boot it
systemctl daemon-reload
systemctl enable terminal-server
systemctl start terminal-server
systemctl status terminal-server   # expect Active: active (running)

# 7. Smoke test
curl -s http://127.0.0.1:10002/healthz
# → {"ok":true,"sessions":0,"ts":"..."}
```

## Expose via Tailscale Funnel

The browser needs to reach this from the public internet. Add a path
mapping under the existing `:8443` Funnel slot (which already serves
`/vault` for memory-vault-api):

```bash
# On the VPS
tailscale funnel --bg --https=8443 --set-path /terminals http://localhost:10002

# Verify
tailscale funnel status
# Expect:
#   :8443/         → http://localhost:18789  (openclaw-gateway)
#   :8443/vault    → http://localhost:8788   (memory-vault-api)
#   :8443/terminals→ http://localhost:10002  (terminal-server)
```

The public URL is `https://srv1197943.taild42583.ts.net:8443/terminals`.
The matching WebSocket URL is `wss://srv1197943.taild42583.ts.net:8443/terminals`.

## Wire the dashboard

In the dashboard's API Keys tab (`/agency/memory#api-keys`), add:

| Provider | Env var | Value |
|---|---|---|
| Terminal Runner URL | `TERMINAL_RUNNER_URL` | `https://srv1197943.taild42583.ts.net:8443/terminals` |
| Terminal Runner Token | `TERMINAL_RUNNER_TOKEN` | the `$TOKEN` you generated above |

These will read at runtime via `getSecret()` and never leave the server.

## Run the Supabase migration

```bash
# From the dashboard repo
psql "$DATABASE_URL" -f supabase/migrations/20260430_terminal_sessions.sql

# Or via the Supabase web dashboard → SQL editor → paste contents
```

## Smoke test from the dashboard

1. Open `https://outreach-github.vercel.app/agency/terminals`
2. Click **+ New terminal**
3. A new pane should appear with `claude` ready to take a prompt
4. Type something — it should respond
5. Close the browser tab. Wait 30 seconds. Reopen. The session should still be there with your output replayed.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Page shows "TERMINAL_RUNNER_URL not configured" | env vars not in `api_keys` table | Add via API Keys tab, refresh |
| Page shows "terminal-server unreachable" | service down, or Funnel path wrong | `systemctl status terminal-server`, `tailscale funnel status` |
| New terminal shows "Connecting…" forever | WebSocket can't reach VPS | Check Funnel exposes the path, browser console for WS error |
| Browser console shows "WebSocket subprotocol mismatch" | Token wrong or service running old build | Verify `TERMINAL_RUNNER_TOKEN` matches in dashboard + systemd unit |
| `npm install` fails with "node-pty build failed" | Missing `make`/`g++`/`python3` | `apt install -y make g++ python3`, retry |
| New terminal connects but `claude` errors | OAuth not set up for that command | Run `claude` once interactively as root to seed the OAuth, then restart the service |
| Sessions disappear after `systemctl restart` | Pre-fix bug — should NOT happen now | Service rehydrates from `tmux ls` on boot. Check journalctl for "rehydrate: adopted N sessions". |
| Memory pressure / sibling OOM-kills | Running >8 sessions on the 16 GB box | Stop a session, dashboard's `MAX_SESSIONS=8` cap should prevent this |
| `git worktree add` fails | branch already exists from a failed previous spawn | Service rolls back branch on failure now; if you see lingering `sess/<uuid>` branches, `git branch -D` them |

## Quick command reference (on the VPS)

```bash
# All active tmux sessions started by terminal-server
tmux ls | grep ^term-

# Logs
journalctl -u terminal-server -f

# All worktrees
cd /root/projects/outreach-dashboard && git worktree list

# Manually nuke a stuck session
tmux kill-session -t term-<id>
git -C /root/projects/outreach-dashboard worktree remove --force /root/projects/wt/sess-<id>
```
