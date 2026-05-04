-- ============================================================
-- Spawn presets — Bug fix · Build feature · Investigate
-- ============================================================
-- Phase 4 #13 of the enterprise-quality terminals overhaul.
--
-- A small lookup table of "starter prompts" the user can pick when
-- spawning a new terminal. Each preset bundles:
--   - a friendly label and an icon name (lucide-react)
--   - a default first prompt (claude reads it as its initial task)
--   - a suggested cost cap (overrides the default $5/session)
--
-- Three rows seeded by default. The UI lets the user add/edit more
-- through the New-terminal dialog later.
--
-- Apply via: Supabase Management API or supabase db push.
-- ============================================================

CREATE TABLE IF NOT EXISTS spawn_presets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         TEXT NOT NULL,
  icon          TEXT NOT NULL DEFAULT 'terminal',
  prompt        TEXT NOT NULL,
  cost_cap_usd  NUMERIC(10,4) NOT NULL DEFAULT 5.00,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spawn_presets_sort
  ON spawn_presets (sort_order, created_at);

ALTER TABLE spawn_presets DISABLE ROW LEVEL SECURITY;

-- Seed the 3 defaults from the plan: Bug fix · Build feature · Investigate.
-- ON CONFLICT clauses use a stable label match so re-running the migration
-- doesn't insert duplicates.
INSERT INTO spawn_presets (label, icon, prompt, cost_cap_usd, is_default, sort_order)
SELECT * FROM (VALUES
  (
    'Bug fix',
    'bug',
    $$You're fixing a bug. Start by:
1. Reading the bug report or repro steps.
2. Reproducing the failure locally if possible.
3. Finding the root cause — never patch the symptom.
4. Writing the smallest possible fix + a regression test.
5. Opening a PR with a clear "before/after" description.
$$,
    3.00,
    TRUE,
    10
  ),
  (
    'Build feature',
    'rocket',
    $$You're building a new feature end-to-end.
1. Read the relevant existing code first — never reinvent.
2. Sketch the smallest viable shape (page + API + DB schema if needed).
3. Implement, then verify with `npx tsc --noEmit` and `npm run build`.
4. Open a PR and request review.
Stay within the cost cap — pace yourself.
$$,
    8.00,
    TRUE,
    20
  ),
  (
    'Investigate',
    'search',
    $$You're investigating an issue, NOT making changes.
1. Read code, logs, DB rows, audit trail.
2. Form a hypothesis with evidence (file paths, line numbers, log lines).
3. Report findings as a single tight summary.
Do not edit files unless explicitly asked.
$$,
    1.50,
    TRUE,
    30
  )
) AS v(label, icon, prompt, cost_cap_usd, is_default, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM spawn_presets sp WHERE sp.label = v.label
);
