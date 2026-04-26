# Decision — AI base stack for the Outreach OS

**Date:** 2026-04-26
**Author:** Claude Code (assisted by Dylan)
**Status:** approved, in-progress build

## Context

Dylan asked for the "best of absolutely everything" for an AI infrastructure on top of the existing Outreach OS. The AI runs on the terminal (not in-app), lives on a separate VPS from production, and supports 10–30 future AI workers as cron-style background tasks.

## Decision

Locked-in stack as of 2026-04-26:

| Layer | Choice | Why |
|---|---|---|
| Conversational AI (terminal) | Claude Code with Opus 4.7 + prompt caching | Best agentic + lowest tool-error rate in 2026 |
| Worker models | Sonnet 4.6 (content), Haiku 4.5 (cheap/fast), Gemini 3.1 Pro (1M ctx) | Right tool per job, ~5–10× savings vs Opus everywhere |
| Agent framework (workers) | Mastra (TS) — fallback LangGraph (Python) if blocked | TS-native, Vercel-native, fits the existing stack |
| Worker runtime | Trigger.dev v4 (or systemd cron on prod VPS for now) | Long-running, retries, observability |
| Project narrative memory | `/memory-hq/` markdown tree in this repo | Forever-versioned, AI-readable, human-editable in any editor |
| Per-fact memory | Existing app DB system (`memories` + `memory_personas`) | Already built and good — wire MCP to it |
| Claude-internal memory | `/root/.claude/projects/-root/memory/` (AI VPS) | Auto-loaded each session |
| Conversational memory (rich) | FalkorDB + Graphiti (Docker) on AI VPS | Temporal facts beyond what flat files give |
| LLM gateway | Helicone self-hosted (Rust, Docker) | Cost tracking + caching + retries for 30 future workers |
| Observability | Langfuse self-hosted (Docker) | Full trace of every AI call |
| MCP servers | Vercel, Supabase, GitHub, Filesystem, Sentry, **custom Memory MCP** bridging to app DB | Standardized agent tools |
| Codebase search | pgvector index of repo, refreshed on push | Instant code lookup for AI |

## Why these (vs alternatives)

- **Mastra over LangGraph for now:** TS matches the existing Next.js dashboard stack — no language barrier for shared types. LangGraph is the fallback if we hit a complexity wall.
- **Helicone over LiteLLM:** Rust = lower latency, better fit for 30 concurrent workers. Self-host avoids vendor cost on telemetry.
- **Langfuse over LangSmith:** open source, self-hostable, ~$1.5–2.8k/mo cheaper than LangSmith for similar volume, framework-agnostic.
- **FalkorDB over Neo4j:** sub-140ms p99 graph queries, better fit for AI workloads than enterprise-Neo4j. Same Cypher dialect.
- **Wire to existing app memory via MCP** instead of building a new memory feature: their system is sophisticated and Dylan already knows the UI.

## Honest caveats

- Mastra ecosystem is younger than LangGraph; if it becomes a blocker we migrate to LangGraph (Python service).
- Self-hosting Langfuse + Helicone + FalkorDB on a single VPS requires monitoring memory; budget at least 4 GB free for stable operation.
- The custom Memory MCP server is a one-off build — when Anthropic ships a "first-party Supabase memory MCP" we may want to migrate.

## Supersedes

None (initial decision).
