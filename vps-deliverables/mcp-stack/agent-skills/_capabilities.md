# Per-agent capability matrix

> Single source of truth for which MCPs each project-specific agent role can
> use. The `tools:` field in each `outreach-*.md` agent file derives from the
> mappings below — when adding a new role or MCP, update both this doc and
> the matching agent file.

## Roles

| Role | File | Purpose |
|---|---|---|
| **outreach-tester** | `outreach-tester.md` | Run E2E tests, verify deploys, debug "why isn't this working" with real browser + dev tools + Sentry |
| **outreach-builder** | `outreach-builder.md` | Write code, run migrations, open PRs, deploy to Vercel |
| **outreach-domain** | `outreach-domain.md` | Send/read messages on behalf of DC Marketing Co (IG, email, SMS, scraping) |
| **outreach-triage** | `outreach-triage.md` | Read-only — triage Sentry errors into GitHub issues, no code changes |
| **jarvis-quick-ask** | (existing) | Conversational answers via Telegram bot — short, direct, beginner-friendly |

## Capability matrix

```
ROLE              | BUILT-IN TOOLS              | MCP TOOLS
------------------+-----------------------------+--------------------------------------------------
outreach-tester   | Read, Bash, Grep, Glob,     | mcp__playwright__*
                  | WebFetch, WebSearch         | mcp__chrome_devtools__*
                  |                             | mcp__sentry__*
                  |                             | mcp__github__* (read PRs/issues — no writes)
------------------+-----------------------------+--------------------------------------------------
outreach-builder  | Read, Write, Edit, Bash,    | mcp__github__*
                  | Grep, Glob                  | mcp__postgres__* (DDL allowed)
                  |                             | mcp__vercel__* (deploys, env, logs)
                  |                             | mcp__context7__* (latest library docs)
                  |                             | mcp__chroma__* (vector search of memory)
------------------+-----------------------------+--------------------------------------------------
outreach-domain   | Read, Write, Bash,          | mcp__claude_ai_Gmail__*
                  | Grep, Glob, WebFetch        | mcp__claude_ai_Google_Calendar__*
                  |                             | mcp__chroma__* (read prospect/template embeddings)
                  |                             | mcp__twilio__* (SMS — alpha, may be flaky)
                  |                             | mcp__apify__* (scraping)
------------------+-----------------------------+--------------------------------------------------
outreach-triage   | Read, Grep, Glob, WebFetch  | mcp__sentry__* (read errors, breadcrumbs)
                  |                             | mcp__github__* (file issues only — no writes)
                  |                             | mcp__postgres__* (read-only — for query data)
------------------+-----------------------------+--------------------------------------------------
jarvis-quick-ask  | Bash, Read, Grep, Glob,     | mcp__github__* (latest commits, recent PRs)
                  | WebFetch                    | mcp__sentry__* (recent errors)
                  |                             | mcp__chroma__* (memory search)
```

## Why role-based, not per-agent

Without role mappings, every new agent file has to know which MCPs to
allow — error-prone and means a new MCP server needs N file edits to roll
out. With this matrix, each new role-template inherits the right set
once. New MCPs go through the matrix, not 36 agent files.

## Adding a new MCP

1. Decide which roles need it (most often: builder + tester)
2. Update the table above
3. Update the matching `outreach-*.md` agent files' `tools:` field
4. The install script will sync them to `/root/memory-vault/Jarvis/agent-skills/`
   on next run; agent-runner picks them up on next subagent spawn

## Adding a new role

1. Add a row to the matrix above
2. Create `outreach-<role>.md` with frontmatter (`name`, `description`,
   `color`, `tools`) + a body explaining when to invoke this role
3. Re-run `scripts/install-mcps.sh` to deploy to memory-vault
