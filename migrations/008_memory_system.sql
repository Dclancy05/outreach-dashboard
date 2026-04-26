-- ═══════════════════════════════════════════════════════════════════════════
-- Memory HQ — first-class memory + persona system for Outreach HQ
-- ═══════════════════════════════════════════════════════════════════════════
-- Models Claude Code's memory file system (user/feedback/project/reference)
-- and exposes it through the dashboard UI + an MCP server for any AI client.
--
-- Tables:
--   memory_personas              — named bundles of system prompt + tone + memories
--   memories              — the actual notes (markdown), categorized + scoped
--   memory_versions       — auto-versioned history of every memory edit
--   memory_injections     — analytics: which memories were injected when, by whom
--   memory_settings       — per-business config (default persona, token budget, MCP enabled)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── memory_personas ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_personas (
  id                  text PRIMARY KEY DEFAULT 'per_' || replace(gen_random_uuid()::text, '-', ''),
  business_id         text,                                   -- null = available to every business
  parent_persona_id   text,                                   -- inheritance (Phase 4)
  name                text NOT NULL,
  emoji               text DEFAULT '🤖',
  description         text,
  system_prompt       text DEFAULT '',
  tone_terse          integer DEFAULT 50 CHECK (tone_terse BETWEEN 0 AND 100),
  tone_formal         integer DEFAULT 50 CHECK (tone_formal BETWEEN 0 AND 100),
  emoji_mode          text DEFAULT 'auto' CHECK (emoji_mode IN ('off','auto','on')),
  is_default          boolean DEFAULT false,
  is_archived         boolean DEFAULT false,
  last_used_at        timestamptz,
  use_count           integer DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE memory_personas DROP CONSTRAINT IF EXISTS memory_personas_parent_fkey;
ALTER TABLE memory_personas
  ADD CONSTRAINT memory_personas_parent_fkey
  FOREIGN KEY (parent_persona_id) REFERENCES memory_personas(id) ON DELETE SET NULL;

-- Only one default persona per business
DROP INDEX IF EXISTS idx_memory_personas_default;
CREATE UNIQUE INDEX idx_memory_personas_default
  ON memory_personas (COALESCE(business_id, '__global__'))
  WHERE is_default = true AND is_archived = false;

CREATE INDEX IF NOT EXISTS idx_memory_personas_business ON memory_personas (business_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_memory_personas_parent ON memory_personas (parent_persona_id) WHERE parent_persona_id IS NOT NULL;

-- ─── memories ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memories (
  id                  text PRIMARY KEY DEFAULT 'mem_' || replace(gen_random_uuid()::text, '-', ''),
  business_id         text,                                   -- null = global
  persona_id          text REFERENCES memory_personas(id) ON DELETE SET NULL,  -- null = applies to all memory_personas
  type                text NOT NULL CHECK (type IN ('user','feedback','project','reference')),
  title               text NOT NULL,
  description         text,
  body                text NOT NULL DEFAULT '',
  emoji               text DEFAULT '📝',
  tags                text[] DEFAULT '{}',
  pinned              boolean DEFAULT false,
  archived            boolean DEFAULT false,
  injection_priority  integer DEFAULT 50 CHECK (injection_priority BETWEEN 0 AND 100),
  why                 text,                                   -- "why this rule exists"
  how_to_apply        text,                                   -- "when this kicks in"
  trigger_keywords    text[] DEFAULT '{}',                    -- tag-based injection
  use_count           integer DEFAULT 0,                      -- analytics: times injected
  last_used_at        timestamptz,
  source              text DEFAULT 'ui' CHECK (source IN ('ui','mcp','import','suggestion','voice','quick_add')),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memories_active
  ON memories (business_id, archived, pinned DESC, injection_priority DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_persona
  ON memories (persona_id) WHERE persona_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memories_type
  ON memories (type, archived);
CREATE INDEX IF NOT EXISTS idx_memories_tags
  ON memories USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_memories_keywords
  ON memories USING GIN (trigger_keywords);

-- Full-text search on title + body for recall
ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'C')
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_memories_search ON memories USING GIN (search_tsv);

-- ─── memory_versions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id           text NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  title               text,
  body                text,
  description         text,
  emoji               text,
  tags                text[],
  changed_by          text DEFAULT 'ui' CHECK (changed_by IN ('ui','mcp','import','sync','suggestion','voice','restore')),
  change_summary      text,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_versions_memory
  ON memory_versions (memory_id, created_at DESC);

-- ─── memory_injections (analytics) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_injections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id           text REFERENCES memories(id) ON DELETE CASCADE,
  persona_id          text REFERENCES memory_personas(id) ON DELETE SET NULL,
  business_id         text,
  client              text,                                   -- 'claude-code' | 'cursor' | 'web-ui' | 'sandbox' etc.
  conversation_id     text,
  token_estimate      integer,
  query               text,                                   -- if recall (semantic), what was asked
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_injections_memory
  ON memory_injections (memory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_injections_persona
  ON memory_injections (persona_id, created_at DESC) WHERE persona_id IS NOT NULL;

-- ─── memory_settings (per-business config) ──────────────────────────────
CREATE TABLE IF NOT EXISTS memory_settings (
  business_id         text PRIMARY KEY,                       -- '__global__' for top-level
  default_persona_id  text REFERENCES memory_personas(id) ON DELETE SET NULL,
  token_budget        integer DEFAULT 2000 CHECK (token_budget BETWEEN 200 AND 16000),
  mcp_enabled         boolean DEFAULT true,
  mcp_api_key         text,                                   -- random secret for MCP auth
  local_sync_enabled  boolean DEFAULT false,
  local_sync_path     text DEFAULT '~/.claude/projects/-Users-dylanclancy/memory',
  auto_suggest        boolean DEFAULT true,
  health_scan_at      timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ─── auto-update updated_at ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION memory_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_memories_touch ON memories;
CREATE TRIGGER trg_memories_touch
  BEFORE UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION memory_touch_updated_at();

DROP TRIGGER IF EXISTS trg_memory_personas_touch ON memory_personas;
CREATE TRIGGER trg_memory_personas_touch
  BEFORE UPDATE ON memory_personas
  FOR EACH ROW EXECUTE FUNCTION memory_touch_updated_at();

DROP TRIGGER IF EXISTS trg_memory_settings_touch ON memory_settings;
CREATE TRIGGER trg_memory_settings_touch
  BEFORE UPDATE ON memory_settings
  FOR EACH ROW EXECUTE FUNCTION memory_touch_updated_at();

-- ─── auto-version memories on update ───────────────────────────────────
CREATE OR REPLACE FUNCTION memory_auto_version()
RETURNS trigger AS $$
BEGIN
  IF (NEW.title IS DISTINCT FROM OLD.title)
     OR (NEW.body IS DISTINCT FROM OLD.body)
     OR (NEW.description IS DISTINCT FROM OLD.description) THEN
    INSERT INTO memory_versions (memory_id, title, body, description, emoji, tags, changed_by)
    VALUES (OLD.id, OLD.title, OLD.body, OLD.description, OLD.emoji, OLD.tags, 'ui');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_memories_version ON memories;
CREATE TRIGGER trg_memories_version
  BEFORE UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION memory_auto_version();

-- ─── seed: a default persona for global use ────────────────────────────
INSERT INTO memory_personas (id, business_id, name, emoji, description, is_default, system_prompt)
VALUES (
  'per_default',
  NULL,
  'Default Assistant',
  '🤖',
  'The fallback persona used when no other persona is selected. Carries global memories.',
  true,
  'You are an assistant for Dylan. Apply the memories below faithfully and ask before taking destructive actions.'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO memory_settings (business_id, default_persona_id, mcp_api_key)
VALUES ('__global__', 'per_default', encode(gen_random_bytes(24), 'hex'))
ON CONFLICT (business_id) DO NOTHING;
