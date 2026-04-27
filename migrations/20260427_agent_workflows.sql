-- Agent Workflows: visual multi-agent system mounted at /agency/memory
-- Five tables form the spine:
--   agents          — DB index for the markdown agent files in
--                     memory-vault/Jarvis/agent-skills/. The `system_prompt`
--                     body lives in the file (not here) so it can also be read
--                     by Claude Code on the AI VPS as a real subagent.
--   workflows       — xyflow node/edge graph stored as one jsonb column.
--   schedules       — cron + payload that fires a workflow on a clock.
--   workflow_runs   — one row per execution. Inngest is the executor.
--   workflow_steps  — hierarchical trace of every node executed within a run
--                     (a Loop body run 5x = 5 step rows, all sharing parent_step_id).
--
-- Cost guards are mandatory and enforced at three layers (workflow.budget_usd,
-- agents.max_tokens, env WORKFLOW_DAILY_BUDGET_USD).
--
-- Seeds three starter workflow templates at the bottom: the test→fix→retest
-- loop Dylan named, an outreach DM with approval gate, and a daily-report
-- overnight job. They land as `status='draft'` so they don't auto-fire on
-- migrate.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── agents ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  emoji           TEXT,
  description     TEXT,
  file_path       TEXT NOT NULL,
  parent_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  persona_id      UUID REFERENCES personas(id) ON DELETE SET NULL,
  model           TEXT NOT NULL DEFAULT 'sonnet',
  tools           TEXT[] NOT NULL DEFAULT '{}',
  max_tokens      INT  NOT NULL DEFAULT 8000,
  is_orchestrator BOOLEAN NOT NULL DEFAULT false,
  archived        BOOLEAN NOT NULL DEFAULT false,
  last_used_at    TIMESTAMPTZ,
  use_count       INT  NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agents_archived_name_idx ON agents (archived, name);
CREATE INDEX IF NOT EXISTS agents_parent_idx ON agents (parent_agent_id) WHERE parent_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agents_persona_idx ON agents (persona_id) WHERE persona_id IS NOT NULL;

-- ─── workflows ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflows (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  description    TEXT,
  emoji          TEXT,
  graph          JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}'::jsonb,
  entry_node_id  TEXT,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  is_template    BOOLEAN NOT NULL DEFAULT false,
  budget_usd     NUMERIC(10,4) NOT NULL DEFAULT 5.0000,
  max_steps      INT NOT NULL DEFAULT 50,
  max_loop_iters INT NOT NULL DEFAULT 10,
  use_count      INT NOT NULL DEFAULT 0,
  last_run_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflows_status_idx ON workflows (status, last_run_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS workflows_template_idx ON workflows (is_template) WHERE is_template = true;

-- ─── schedules ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id    UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  name           TEXT,
  cron           TEXT NOT NULL,
  timezone       TEXT NOT NULL DEFAULT 'America/New_York',
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled        BOOLEAN NOT NULL DEFAULT true,
  last_fired_at  TIMESTAMPTZ,
  next_fire_at   TIMESTAMPTZ,
  fire_count     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schedules_due_idx ON schedules (enabled, next_fire_at) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS schedules_workflow_idx ON schedules (workflow_id);

-- ─── workflow_runs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  schedule_id     UUID REFERENCES schedules(id) ON DELETE SET NULL,
  trigger         TEXT NOT NULL CHECK (trigger IN ('manual','schedule','api','test','dry_run')),
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','paused','succeeded','failed','aborted','budget_exceeded')),
  inngest_run_id  TEXT,
  input           JSONB NOT NULL DEFAULT '{}'::jsonb,
  output          JSONB,
  summary         TEXT,
  cost_usd        NUMERIC(10,4) NOT NULL DEFAULT 0,
  total_tokens    INT NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflow_runs_workflow_idx ON workflow_runs (workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_runs_status_idx ON workflow_runs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_runs_schedule_idx ON workflow_runs (schedule_id) WHERE schedule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS workflow_runs_inngest_idx ON workflow_runs (inngest_run_id) WHERE inngest_run_id IS NOT NULL;

-- ─── workflow_steps ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  parent_step_id  UUID REFERENCES workflow_steps(id) ON DELETE CASCADE,
  node_id         TEXT NOT NULL,
  node_type       TEXT NOT NULL CHECK (node_type IN ('trigger','agent','orchestrator','loop','router','approval','output')),
  agent_id        UUID REFERENCES agents(id) ON DELETE SET NULL,
  iteration       INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','succeeded','failed','skipped','awaiting_approval')),
  input           JSONB,
  output          JSONB,
  cost_usd        NUMERIC(10,4) NOT NULL DEFAULT 0,
  tokens          INT NOT NULL DEFAULT 0,
  log_url         TEXT,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflow_steps_run_idx ON workflow_steps (run_id, started_at);
CREATE INDEX IF NOT EXISTS workflow_steps_parent_idx ON workflow_steps (parent_step_id) WHERE parent_step_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS workflow_steps_status_idx ON workflow_steps (status) WHERE status IN ('running','awaiting_approval');

-- ─── updated_at trigger (shared) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION agent_workflows_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agents_touch ON agents;
CREATE TRIGGER trg_agents_touch BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION agent_workflows_touch_updated_at();

DROP TRIGGER IF EXISTS trg_workflows_touch ON workflows;
CREATE TRIGGER trg_workflows_touch BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION agent_workflows_touch_updated_at();

DROP TRIGGER IF EXISTS trg_schedules_touch ON schedules;
CREATE TRIGGER trg_schedules_touch BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION agent_workflows_touch_updated_at();

-- ─── RLS: service_role only (matches api_keys, automations conventions) ────
ALTER TABLE agents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows      ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_steps ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON agents, workflows, schedules, workflow_runs, workflow_steps FROM anon;
REVOKE ALL ON agents, workflows, schedules, workflow_runs, workflow_steps FROM authenticated;

DROP POLICY IF EXISTS "agents service role only" ON agents;
CREATE POLICY "agents service role only" ON agents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "workflows service role only" ON workflows;
CREATE POLICY "workflows service role only" ON workflows
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "schedules service role only" ON schedules;
CREATE POLICY "schedules service role only" ON schedules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "workflow_runs service role only" ON workflow_runs;
CREATE POLICY "workflow_runs service role only" ON workflow_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "workflow_steps service role only" ON workflow_steps;
CREATE POLICY "workflow_steps service role only" ON workflow_steps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- Seed templates (status='draft', is_template=true). The xyflow graphs below
-- are the bare-bones structure; Dylan tweaks them in the visual builder.
-- Stable UUIDs so seeds are idempotent on re-run.
-- ────────────────────────────────────────────────────────────────────────────

-- Template 1: Code → test → fix → retest loop (Dylan's canonical use case)
INSERT INTO workflows (id, name, description, emoji, graph, entry_node_id, status, is_template, budget_usd, max_steps, max_loop_iters)
VALUES (
  '00000000-0000-4000-a000-000000000001',
  'Code: write → test → fix → retest',
  'Orchestrator delegates: writer drafts code, tester runs the suite, if any tests fail the fixer patches and the loop repeats until tests pass or max_loop_iters trips.',
  '🔁',
  $$
{
  "nodes": [
    {"id":"trigger","type":"trigger","position":{"x":40,"y":200},"data":{"label":"Start","input_schema":{"task":"string","test_command":"string"}}},
    {"id":"orchestrator","type":"orchestrator","position":{"x":260,"y":200},"data":{"label":"Orchestrator","agent_slug":"code-orchestrator","routes":["writer"]}},
    {"id":"writer","type":"agent","position":{"x":520,"y":200},"data":{"label":"Writer","agent_slug":"code-writer","prompt":"Write the code for: {{task}}","output_var":"code"}},
    {"id":"loop","type":"loop","position":{"x":760,"y":80},"style":{"width":540,"height":340},"data":{"label":"Test–fix loop","mode":"until","condition":"$.tests.failed === 0","max_iterations":10}},
    {"id":"tester","type":"agent","parentNode":"loop","extent":"parent","position":{"x":40,"y":80},"data":{"label":"Tester","agent_slug":"code-tester","prompt":"Run {{test_command}} and report failures.","output_var":"tests"}},
    {"id":"router","type":"router","parentNode":"loop","extent":"parent","position":{"x":260,"y":80},"data":{"label":"Pass?","condition":"$.tests.failed === 0"}},
    {"id":"fixer","type":"agent","parentNode":"loop","extent":"parent","position":{"x":40,"y":220},"data":{"label":"Fixer","agent_slug":"code-fixer","prompt":"Fix these failing tests: {{tests.failures}}","output_var":"code"}},
    {"id":"output","type":"output","position":{"x":1360,"y":200},"data":{"label":"Done","output_schema":{"code":"string","tests":"object","iterations":"number"}}}
  ],
  "edges": [
    {"id":"e1","source":"trigger","target":"orchestrator"},
    {"id":"e2","source":"orchestrator","target":"writer"},
    {"id":"e3","source":"writer","target":"tester"},
    {"id":"e4","source":"tester","target":"router"},
    {"id":"e5","source":"router","target":"output","label":"pass","data":{"branch":"true"}},
    {"id":"e6","source":"router","target":"fixer","label":"fail","data":{"branch":"false"}},
    {"id":"e7","source":"fixer","target":"tester"}
  ],
  "viewport": {"x":0,"y":0,"zoom":0.85}
}
  $$::jsonb,
  'trigger', 'draft', true, 5.0000, 100, 10
)
ON CONFLICT (id) DO UPDATE SET
  graph = EXCLUDED.graph,
  description = EXCLUDED.description,
  updated_at = now();

-- Template 2: Outreach DM with approval gate
INSERT INTO workflows (id, name, description, emoji, graph, entry_node_id, status, is_template, budget_usd, max_steps, max_loop_iters)
VALUES (
  '00000000-0000-4000-a000-000000000002',
  'Outreach: research → draft → approve → send',
  'Lead researcher gathers context on a target business, writer drafts a personalized DM, you approve it inline, then the sender pushes it through the right channel.',
  '✉️',
  $$
{
  "nodes": [
    {"id":"trigger","type":"trigger","position":{"x":40,"y":160},"data":{"label":"Start","input_schema":{"lead_id":"string","platform":"string"}}},
    {"id":"researcher","type":"agent","position":{"x":260,"y":160},"data":{"label":"Lead researcher","agent_slug":"lead-researcher","prompt":"Research lead {{lead_id}} on {{platform}}: business name, niche, recent posts, pain points.","output_var":"context"}},
    {"id":"writer","type":"agent","position":{"x":520,"y":160},"data":{"label":"DM writer","agent_slug":"outreach-writer","prompt":"Write a 2-3 sentence personalized DM. Context: {{context}}. Casual, no corporate tone, mention one specific thing from their recent activity.","output_var":"draft"}},
    {"id":"approval","type":"approval","position":{"x":780,"y":160},"data":{"label":"Approve DM","message":"Send this DM to {{lead_id}}?\n\n---\n{{draft}}\n---","channel":"in_app","timeout_minutes":1440}},
    {"id":"sender","type":"agent","position":{"x":1040,"y":160},"data":{"label":"Sender","agent_slug":"outreach-sender","prompt":"Send this DM via {{platform}} to lead {{lead_id}}: {{draft}}","output_var":"send_result"}},
    {"id":"output","type":"output","position":{"x":1300,"y":160},"data":{"label":"Sent","output_schema":{"send_result":"object"}}}
  ],
  "edges": [
    {"id":"e1","source":"trigger","target":"researcher"},
    {"id":"e2","source":"researcher","target":"writer"},
    {"id":"e3","source":"writer","target":"approval"},
    {"id":"e4","source":"approval","target":"sender","label":"approved"},
    {"id":"e5","source":"sender","target":"output"}
  ],
  "viewport": {"x":0,"y":0,"zoom":0.9}
}
  $$::jsonb,
  'trigger', 'draft', true, 2.0000, 20, 1
)
ON CONFLICT (id) DO UPDATE SET
  graph = EXCLUDED.graph,
  description = EXCLUDED.description,
  updated_at = now();

-- Template 3: Daily report (overnight schedule)
INSERT INTO workflows (id, name, description, emoji, graph, entry_node_id, status, is_template, budget_usd, max_steps, max_loop_iters)
VALUES (
  '00000000-0000-4000-a000-000000000003',
  'Daily report: gather → analyze → email me',
  'Pulls yesterday''s outreach metrics, asks the analyst what worked and what to change, emails you a one-pager. Built to run overnight on a schedule.',
  '📊',
  $$
{
  "nodes": [
    {"id":"trigger","type":"trigger","position":{"x":40,"y":160},"data":{"label":"Start","input_schema":{"date":"string"}}},
    {"id":"gather","type":"agent","position":{"x":260,"y":160},"data":{"label":"Metrics gatherer","agent_slug":"metrics-gatherer","prompt":"Pull yesterday's outreach metrics: sends, replies, reply rate, pipeline movements. Date: {{date}}","output_var":"metrics"}},
    {"id":"analyst","type":"agent","position":{"x":520,"y":160},"data":{"label":"Analyst","agent_slug":"performance-analyst","prompt":"Look at these metrics: {{metrics}}. What worked yesterday and what should I change today? Plain English, 5 bullets max.","output_var":"insights"}},
    {"id":"emailer","type":"agent","position":{"x":780,"y":160},"data":{"label":"Email sender","agent_slug":"email-sender","prompt":"Email these insights to me: {{insights}}. Subject line: 'Daily report — {{date}}'.","output_var":"sent"}},
    {"id":"output","type":"output","position":{"x":1040,"y":160},"data":{"label":"Done","output_schema":{"sent":"object"}}}
  ],
  "edges": [
    {"id":"e1","source":"trigger","target":"gather"},
    {"id":"e2","source":"gather","target":"analyst"},
    {"id":"e3","source":"analyst","target":"emailer"},
    {"id":"e4","source":"emailer","target":"output"}
  ],
  "viewport": {"x":0,"y":0,"zoom":1}
}
  $$::jsonb,
  'trigger', 'draft', true, 1.0000, 10, 1
)
ON CONFLICT (id) DO UPDATE SET
  graph = EXCLUDED.graph,
  description = EXCLUDED.description,
  updated_at = now();
