# AI VPS Runbook (srv1378286)

> Plain-English reference for Dylan. The AI command center lives on this VPS, separate from production (srv1197943). Read top to bottom on first use, then bookmark for emergencies.

## What's running on this VPS

| Service | URL / Port | Purpose | Auto-restart? |
|---|---|---|---|
| **Claude Code** (terminal) | shell command `claude` | Where you talk to the AI | n/a (you launch it) |
| **Memory MCP server** | stdio (auto-started by Claude) | Bridges Claude to the app's `/agency/memory` | yes (Claude spawns it) |
| **Langfuse** | http://127.0.0.1:3300 | Traces + cost view of every AI call | yes (Docker `unless-stopped`) |
| **FalkorDB** | redis://127.0.0.1:6379 | Graph DB for richer conversational memory (Graphiti to follow) | yes |
| **Helicone gateway** | http://127.0.0.1:8787 | LLM proxy w/ cost tracking + caching (boots when ANTHROPIC_API_KEY arrives) | yes (when started) |
| **UFW firewall** | — | Only SSH + Tailscale allowed; everything else blocked | system |
| **fail2ban** | — | Auto-bans SSH brute-force attempts | system |
| **unattended-upgrades** | — | Daily security patches | system |
| **Tailscale** | `outreach-vps-2` (100.127.163.51) | Private network to production VPS + your Mac | system |

## Daily flow (the normal day)

1. **Open a session:** SSH to this VPS, then `cd /root/projects/outreach-dashboard && claude`
2. **Tell the AI what you want.** It auto-loads:
   - `CLAUDE.md` (the briefing — full project context)
   - Its own persistent memory (`/root/.claude/projects/-root/memory/`)
   - When you ask "what do you remember about X" → it can call `memory_inject` (MCP tool) to pull from the in-app `/agency/memory` system
3. **Work happens.** AI reads code, edits files, runs tests, commits.
4. **End of session:** AI writes a session summary to `/memory-hq/sessions/$(date).md`, commits, pushes to a feature branch.
5. **You merge the PR** when you've reviewed it on GitHub.

## What you need to do (one-time setup left)

These are the remaining items that need YOU because they require credentials I shouldn't see or interactive OAuth.

### 1. Add the Anthropic API key (unblocks Helicone, Graphiti, future workers)

```bash
# get your key from https://console.anthropic.com/settings/keys
/root/.config/social-saas/add-key.sh ANTHROPIC_API_KEY
# (paste when prompted — it's hidden)

# then start Helicone:
set -a && source /root/.config/social-saas/.env && set +a
cd /root/services/helicone && docker compose up -d
```

### 2. Add OUTREACH_MEMORY_MCP_KEY to Vercel env vars (unblocks Memory MCP → live API)

The middleware in your repo at `src/middleware.ts` line 24 already accepts an `x-mcp-key` header on `/api/memories`, `/api/memories/inject`, `/api/personas` when it matches `OUTREACH_MEMORY_MCP_KEY`. You need to set that env var in Vercel.

The key is already generated and stored on this VPS — copy it from:
```bash
grep OUTREACH_MEMORY_MCP_KEY /root/.config/social-saas/.env
```
Then in Vercel dashboard: **Project Settings → Environment Variables → Add → name=`OUTREACH_MEMORY_MCP_KEY`, value=(paste), all environments**. Trigger a redeploy (or just wait — next push triggers one).

### 3. Authenticate Vercel MCP (interactive)

```bash
cd /root/projects/outreach-dashboard
claude
# inside Claude:
/mcp
# select Vercel → follow OAuth prompt
```

### 4. Add Supabase service-role key (when you want Memory MCP to read DB directly, faster than going through Vercel)

```bash
/root/.config/social-saas/add-key.sh SUPABASE_SERVICE_ROLE_KEY
/root/.config/social-saas/add-key.sh SUPABASE_URL
# (URL is https://yfufocegjhxxffqtkvkr.supabase.co)
```

### 5. (Optional) Install the daily backup cron

```bash
crontab -e
# add this line:
0 4 * * * /root/services/backup-ai-vps.sh >> /var/log/backup-ai-vps.log 2>&1
```
Backs up Claude memory + Memory HQ + Docker volumes to `/root/backups/` daily, prunes >14 days.

### 6. Rotate exposed credentials

These were pasted in chat or live in `SYSTEM.md` (public-ish):
- ⚠️ GitHub PAT `ghp_RCH...VgAg` — revoke at https://github.com/settings/tokens, generate new, save via `add-key.sh GITHUB_TOKEN`
- ⚠️ Supabase DB password `Dc-12123675458` (in SYSTEM.md) — rotate in Supabase dashboard
- ⚠️ GHL token in SYSTEM.md — rotate in GHL
- ⚠️ Admin PIN `122436` (in SYSTEM.md) — change in env

## When something breaks

### Langfuse won't load
```bash
cd /root/services/langfuse
docker compose ps               # see which container is unhealthy
docker compose logs --tail=50 langfuse-web
docker compose restart langfuse-web
```

### Memory MCP not returning anything
```bash
/root/.local/bin/claude mcp list                      # check it's connected
curl -sI -H "x-mcp-key: $(grep OUTREACH_MEMORY_MCP_KEY /root/.config/social-saas/.env | cut -d= -f2)" \
  https://outreach-github.vercel.app/api/memories?limit=1
# expect HTTP 200. If 401, the env var isn't set in Vercel yet.
```

### Locked out of SSH
- You set up a recovery via Hostinger console (the web-based VPS management). UFW won't block console.
- Fastest fix from console: `ufw disable`

### Disk full
```bash
df -h
docker system prune -a --volumes  # nukes unused images + dangling volumes (ASK FIRST)
```

### Need to start fresh
All AI tooling lives in `/root/services/*` and `/root/.config/social-saas/`. To rebuild from scratch:
1. `docker compose down -v` in each `/root/services/*/` dir
2. Re-run the bootstrap (this runbook tells you how)

## File map (where stuff lives)

```
/root/
├── .claude/
│   ├── settings.json              ← global Claude Code prefs
│   ├── settings.local.json        ← per-machine Claude Code permissions
│   └── projects/-root/memory/     ← Claude's persistent memory across sessions
├── .config/social-saas/
│   ├── .env                       ← all API keys (chmod 600)
│   ├── load-env.sh                ← auto-loads on shell start
│   └── add-key.sh                 ← safe way to add a key (hidden input)
├── projects/outreach-dashboard/   ← cloned repo
│   ├── CLAUDE.md                  ← AI briefing for THIS repo
│   ├── memory-hq/                 ← project narrative (versioned)
│   └── .claude/settings.json      ← repo-specific Claude config
└── services/
    ├── langfuse/                  ← traces + cost UI (running)
    ├── falkordb/                  ← graph DB (running)
    ├── helicone/                  ← LLM gateway (waiting for key)
    ├── memory-mcp/                ← bridges Claude → app /api/memories
    └── backup-ai-vps.sh           ← daily backup script
```

## Quick commands

```bash
# Start a session
cd /root/projects/outreach-dashboard && claude

# Pull latest from GitHub
cd /root/projects/outreach-dashboard && git pull

# Check all Docker stacks
docker ps

# Tail any container's logs
docker logs -f <container-name>

# Verify Tailscale to prod VPS
tailscale ping srv1197943

# Free up RAM
docker system prune
```
