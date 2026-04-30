# Deploy — MCP Stack (Browser + DevTools + Postgres on srv1197943)

This is the operational reference for the three Docker MCP servers that
sit on srv1197943 and serve all of: Mac Claude Code, Vercel dashboard
functions, and VPS-spawned subagents.

For first-time install, run `bash scripts/install-mcps.sh` from the
dashboard repo on your Mac. This doc is for **rotating tokens, debugging,
and re-deploying** after changes.

## What's running

| Container | Port | Funnel path | Image |
|---|---|---|---|
| `mcp-playwright` | 8010 | `:8443/mcp/playwright` | `mcr.microsoft.com/playwright:v1.49.0-jammy` |
| `mcp-devtools`   | 8011 | `:8443/mcp/devtools`   | `node:22-alpine` + `chrome-devtools-mcp` |
| `mcp-postgres`   | 8012 | `:8443/mcp/postgres`   | `node:22-alpine` + `@modelcontextprotocol/server-postgres` |

All bind to `127.0.0.1` only. Tailscale Funnel + bearer tokens are the
auth. Public internet sees only the funnel; tokens never appear in URLs.

## Re-deploy after code changes

```bash
# On your Mac, in the dashboard repo
rsync -az vps-deliverables/mcp-stack/ root@srv1197943.hstgr.cloud:/opt/mcp-stack/
ssh root@srv1197943.hstgr.cloud "cd /opt/mcp-stack && docker compose up -d --remove-orphans"
```

Or just re-run the full installer (idempotent):

```bash
bash scripts/install-mcps.sh
```

## Rotate a bearer token

```bash
# 1. Generate new token
NEW=$(openssl rand -hex 24)

# 2. Update on the VPS
ssh root@srv1197943.hstgr.cloud "sed -i 's|^PLAYWRIGHT_MCP_TOKEN=.*|PLAYWRIGHT_MCP_TOKEN=$NEW|' /etc/mcp-stack.env && cd /opt/mcp-stack && docker compose restart playwright-mcp"

# 3. Update on your Mac
sed -i.bak "s|^PLAYWRIGHT_MCP_TOKEN=.*|PLAYWRIGHT_MCP_TOKEN=$NEW|" ~/.outreach-mcp-tokens

# 4. Update in dashboard's api_keys (so the row matches)
# Use the dashboard UI: /agency/memory#api-keys → find PLAYWRIGHT_MCP_TOKEN → edit value

# 5. Re-add the MCP in Claude Code with the new bearer
claude mcp remove playwright
claude mcp add playwright --transport http --url "https://srv1197943.taild42583.ts.net:8443/mcp/playwright" --header "Authorization: Bearer $NEW"
```

## Health check

```bash
ssh root@srv1197943.hstgr.cloud "cd /opt/mcp-stack && docker compose ps"
ssh root@srv1197943.hstgr.cloud "docker compose -f /opt/mcp-stack/docker-compose.yml logs --tail=20"
```

From your Mac (via Tailscale Funnel):

```bash
TOK=$(grep PLAYWRIGHT_MCP_TOKEN ~/.outreach-mcp-tokens | sed 's/.*=//')
curl -H "Authorization: Bearer $TOK" https://srv1197943.taild42583.ts.net:8443/mcp/playwright/healthz
```

## Resource usage on the box

```bash
ssh root@srv1197943.hstgr.cloud 'docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"'
```

Caps:
- `playwright-mcp`: 1.5 GB / 1.5 CPU (browser is hungry)
- `devtools-mcp`: 512 MB / 0.5 CPU (CDP proxy)
- `postgres-mcp`: 384 MB / 0.25 CPU (mostly idle)

Total ≈ 2.4 GB. With 8 terminal sessions × 1 GB + ~5 GB existing services
= ~15.4 GB on a 16 GB box. Tight. Don't ship this with terminal-runner
also pegged at 8 sessions long-term — upgrade VPS RAM first.

## Troubleshooting

| Symptom | Diagnosis | Fix |
|---|---|---|
| `claude mcp list` shows playwright as ✗ | Funnel path missing or container down | `tailscale funnel status` on VPS, then `docker compose ps` |
| Playwright returns "Browser launch failed" | Out of disk (Chromium ~300 MB cache) | `df -h` on VPS, `docker system prune` |
| DevTools returns "CDP unreachable" | Chrome host service stopped | `systemctl status chrome-cdp.service` (or whatever the host service name is) |
| Postgres returns "connection refused" | Pooler URL stale (Supabase rotated) | Pull fresh URL from Supabase dashboard, update `/etc/mcp-stack.env`, restart |
| Tailscale Funnel slot full | All 3 ports (443, 8443, 10000) used | We use path-mapping under `:8443`. If `funnel status` shows the path missing, re-run installer |
| `docker: command not found` | Auto-install failed | Manually: `apt install -y docker.io && systemctl enable --now docker` |

## Connecting from a fresh client

If you provision a new Mac or want a different agent's machine to use the
stack:

```bash
# Get the tokens from your existing tokens file (or rotate, see above)
source ~/.outreach-mcp-tokens

claude mcp add playwright --transport http \
  --url "https://srv1197943.taild42583.ts.net:8443/mcp/playwright" \
  --header "Authorization: Bearer $PLAYWRIGHT_MCP_TOKEN"

claude mcp add devtools --transport http \
  --url "https://srv1197943.taild42583.ts.net:8443/mcp/devtools" \
  --header "Authorization: Bearer $DEVTOOLS_MCP_TOKEN"

claude mcp add postgres --transport http \
  --url "https://srv1197943.taild42583.ts.net:8443/mcp/postgres" \
  --header "Authorization: Bearer $POSTGRES_MCP_TOKEN"
```

The Tailscale node must be on the tailnet. Add the new device via
`tailscale up` first.
