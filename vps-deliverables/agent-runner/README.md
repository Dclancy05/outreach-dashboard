# agent-runner

Tiny HTTP service that runs Claude agents on the VPS. Called per step by the dashboard's Inngest workflow function (`src/lib/inngest/functions/run-workflow.ts`). Reads agent definitions from `~/.claude/agents/{slug}.md` — the same files Claude Code uses as subagents in terminal sessions, kept in sync via `sync-vault.sh`.

## Endpoints

| Method | Path | What |
|---|---|---|
| `POST` | `/agents/run` | Body: `{ agent_slug, prompt, vars?, parent_run_id? }`. Returns `{ output, cost_usd, tokens, log_url }`. |
| `GET`  | `/agents/runs/:id/logs` | SSE stream of log lines (used by the dashboard's Runs subtab). |
| `GET`  | `/healthz` | 200 OK + paths. |

Auth: `Bearer ${AGENT_RUNNER_TOKEN}`. If unset, the service runs open (dev mode only).

## Deploy (VPS pattern)

```bash
# From the repo root, on your laptop:
scp -r vps-deliverables/agent-runner root@srv1197943:/root/agent-runner

# On the VPS:
cd /root/agent-runner
npm install

# Env file (root only)
cat > /etc/agent-runner.env <<EOF
ANTHROPIC_API_KEY=sk-ant-...
AGENT_RUNNER_TOKEN=$(openssl rand -hex 32)
PORT=10001
AGENTS_DIR=/root/.claude/agents
EOF
chmod 600 /etc/agent-runner.env

# Install systemd unit
cp agent-runner.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now agent-runner
systemctl status agent-runner

# Tail logs
journalctl -fu agent-runner
```

## Set the dashboard env

Add to Vercel:
```
AGENT_RUNNER_URL=https://<tailscale or public hostname>:10001
AGENT_RUNNER_TOKEN=<same token as in /etc/agent-runner.env>
```

If the VPS isn't publicly reachable, expose via Tailscale Funnel or Caddy (matches the existing `MEMORY_VAULT_API_URL` setup).

## Tools supported (v1)

`Bash`, `Read`, `Write`. Wired directly in `index.ts → execTool()`. Add more by extending `TOOL_SCHEMAS` and the dispatch switch.

## Cost guards

- Per-step wall-clock cap: 5 minutes (hard kill).
- Per-step token cap: from the agent's frontmatter `max_tokens` (default 8000).
- Cost reporting back to the dashboard uses the public per-1M-token prices (Opus $15/$75, Sonnet $3/$15, Haiku $0.80/$4.00) — accuracy ±10%.
