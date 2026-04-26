# Memory HQ

> Dylan's living brain for the Outreach OS. Read this first, then drill into whichever folder is relevant.

This is **structured project memory** — markdown files versioned in Git that any human or AI working on this project can read. It complements:
- `/SYSTEM.md` (the definitive product bible)
- The DB-backed memory system at `/agency/memory` in the live app (per-fact memories, surfaced into AI prompts)
- Claude Code's local memory at `/root/.claude/projects/-root/memory/` on the AI VPS

**Rule of thumb for where things go:**
- A *narrative* about the project (what we're building, how it fits together, why) → here, in Memory HQ
- A *single fact* the AI should remember mid-conversation ("user dislikes formal tone", "use Postgres not Mongo") → in `/agency/memory` via the dashboard
- A *technical/AI-internal scratch note* that only Claude needs → in Claude's own memory dir

## Structure

```
/memory-hq/
  README.md                  ← this file
  /vision/                   mission, target customer, competitors, brand voice
  /product/                  what's shipped / wip / planned, golden user flows
  /technical/                stack, data model, integrations, deployment runbooks
  /agents/                   AI worker roster + prompts + personas
  /decisions/                append-only decision log, dated, never edit old entries
  /sessions/                 AI-written summaries of significant Claude sessions
```

## Conventions

- **Filenames:** `kebab-case.md`. For dated logs: `YYYY-MM-DD-short-slug.md`.
- **Frontmatter:** every file starts with `# Title` and a one-line summary.
- **Decisions are append-only.** If a past decision changed, write a NEW decision file that supersedes it; don't edit the old one.
- **Sessions are written by the AI** at the end of every significant working session (see CLAUDE.md "When you start a session").
- **Edits are commits.** Every change to Memory HQ is a Git commit. Use clear messages: `memory-hq: log decision to switch worker runner from X to Y`.

## How the AI uses this

When Claude Code or any AI tool starts a session in this repo:
1. It reads `CLAUDE.md` at the repo root (always loaded)
2. It reads `memory-hq/README.md` (this file)
3. It reads recent `memory-hq/sessions/*.md` to pick up where the last session left off
4. It pulls context-relevant DB memories via the `/api/memories/inject` endpoint
5. It then talks to the user

When the user asks the AI to "remember" something:
- A *fact, rule, preference, or reference* → AI calls the memory MCP tool to insert into the DB (visible in `/agency/memory`)
- A *project narrative or decision* → AI writes/updates a file here in Memory HQ and commits

## Authoritative pointers

- **Product bible:** `/SYSTEM.md`
- **Cron reality:** `/cron-jobs-todo.md`
- **Automations spec:** `/automations-page-spec.md`
- **VPS deploys:** `/DEPLOY_VPS_PART_B.md`
- **AI briefing:** `/CLAUDE.md`
