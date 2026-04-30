# MCP Stack — srv1197943

Three HTTP-transport MCP servers running as Docker containers, exposed via
Tailscale Funnel under `:8443/mcp/*`. Shared by the local Mac (Claude Code
CLI), Vercel dashboard functions, and VPS agent-runner subagents.

## Services

| Path | Port | What it does | Image |
|---|---|---|---|
| `:8443/mcp/playwright` | 8010 | Browser automation (click, type, screenshot, assert) | `mcr.microsoft.com/playwright:v1.49.0-jammy` + `@playwright/mcp` |
| `:8443/mcp/devtools` | 8011 | Read Chrome console, network, performance via the existing CDP | `node:22-alpine` + `chrome-devtools-mcp` (host network → CDP at `:9222`) |
| `:8443/mcp/postgres` | 8012 | Direct Supabase Postgres SQL (DDL + complex queries) | `node:22-alpine` + `@modelcontextprotocol/server-postgres` via supergateway |

## Deploy

`scripts/install-mcps.sh` from the dashboard repo handles everything. To do
it manually:

```bash
# On the VPS
cd /opt/mcp-stack
docker compose up -d

# Tailscale Funnel paths
tailscale funnel --bg --https=8443 --set-path /mcp/playwright http://127.0.0.1:8010
tailscale funnel --bg --https=8443 --set-path /mcp/devtools   http://127.0.0.1:8011
tailscale funnel --bg --https=8443 --set-path /mcp/postgres   http://127.0.0.1:8012
```

## Auth

Each service requires an `Authorization: Bearer <TOKEN>` header. Tokens live
in `/etc/mcp-stack.env` (mode 600, root-only). Install script generates
fresh per-service tokens with `openssl rand -hex 24`.

To rotate: `openssl rand -hex 24` → update token in `/etc/mcp-stack.env` →
update matching value in dashboard's `api_keys` table → `docker compose
restart`.

## Health

```bash
# All three /healthz endpoints (replace TOKEN with the matching service's value)
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8010/healthz
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8011/healthz
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8012/healthz
```

Each returns `{"ok":true}` when the upstream MCP process is reachable.

## Logs

```bash
docker compose logs -f playwright-mcp     # one service
docker compose logs -f                    # all
journalctl -u docker --since "1h ago"     # docker daemon itself
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `playwright-mcp` container crashes on start | Out of disk (Chromium download is ~300 MB) | `df -h /` and prune old docker images |
| `devtools-mcp` returns "CDP unreachable" | Chrome service not running on host | `systemctl status chrome-cdp.service` (or whatever the service name is) |
| `postgres-mcp` returns "FATAL: password authentication failed" | Wrong connection string | Re-pull from Supabase dashboard → Connection string → Pooler |
| Bearer token rejected | Token in dashboard's `api_keys` doesn't match `/etc/mcp-stack.env` | Re-run `scripts/install-mcps.sh` (idempotent — re-syncs both sides) |
| Tailscale Funnel returns 404 | Path not registered | `tailscale funnel status` and re-run `--set-path` commands |

## Resource caps (per container)

- `playwright-mcp` — 1.5 GB RAM, 1.5 CPUs (browser is hungry)
- `devtools-mcp` — 512 MB RAM, 0.5 CPUs (just a CDP proxy)
- `postgres-mcp` — 384 MB RAM, 0.25 CPUs (mostly idle, query-driven)

Total: ~2.4 GB headroom. With 8 terminal sessions × 1 GB cap = 8 GB, plus
~5 GB for existing services, leaves ~600 MB on the 16 GB box. Tight but
functional. Upgrade VPS if you push past 8 sessions regularly.
