-- ============================================================
-- Memory Vault — File Mirror
-- ============================================================
-- Mirror of /root/memory-vault/ on the AI VPS into Supabase.
-- The AI VPS file-server (memory-vault-api) is the source of truth;
-- a syncer daemon pushes changes here so the web UI can read+search
-- without a Tailscale hop, and so Supabase Realtime can broadcast
-- live edits to all open browser tabs.
--
-- Apply via: psql / Supabase dashboard / supabase db push
-- ============================================================

-- ─── memory_files ──────────────────────────────────────────────
-- Each row = one file or folder in the vault. Path is the natural PK.
CREATE TABLE IF NOT EXISTS memory_files (
  path          TEXT PRIMARY KEY,             -- e.g. "/Jarvis/CLAUDE.md"; "/" for root
  parent_path   TEXT,                          -- e.g. "/Jarvis"; NULL for root
  name          TEXT NOT NULL,                 -- e.g. "CLAUDE.md"
  kind          TEXT NOT NULL CHECK (kind IN ('file','folder')),
  content       TEXT,                          -- NULL for folders
  size_bytes    INTEGER,                       -- NULL for folders
  sha256        TEXT,                          -- content hash; null for folders
  mime          TEXT DEFAULT 'text/markdown',
  is_symlink    BOOLEAN DEFAULT FALSE,
  symlink_target TEXT,                         -- realpath if is_symlink
  business_id   TEXT,                          -- null = global, else scoped
  archived      BOOLEAN DEFAULT FALSE,
  source_origin TEXT DEFAULT 'syncer',         -- syncer | web | mcp | ai
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Generated full-text search vector
  search_tsv    TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')),    'A') ||
    setweight(to_tsvector('english', coalesce(path, '')),    'B') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'C')
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_memory_files_parent     ON memory_files (parent_path);
CREATE INDEX IF NOT EXISTS idx_memory_files_kind       ON memory_files (kind);
CREATE INDEX IF NOT EXISTS idx_memory_files_updated    ON memory_files (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_files_active     ON memory_files (business_id, archived) WHERE archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_memory_files_search_tsv ON memory_files USING GIN (search_tsv);

-- ─── memory_files_versions ────────────────────────────────────
-- Auto-populated by trigger before each UPDATE on memory_files.
-- Capped per-path to 200 versions by a periodic cleanup job (not in this migration).
CREATE TABLE IF NOT EXISTS memory_files_versions (
  id            BIGSERIAL PRIMARY KEY,
  path          TEXT NOT NULL,
  content       TEXT,
  size_bytes    INTEGER,
  sha256        TEXT,
  changed_by    TEXT DEFAULT 'syncer',
  change_summary TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_files_versions_path ON memory_files_versions (path, created_at DESC);

-- ─── Triggers ─────────────────────────────────────────────────

-- updated_at auto-bump
CREATE OR REPLACE FUNCTION memory_files_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_memory_files_touch ON memory_files;
CREATE TRIGGER trg_memory_files_touch
  BEFORE UPDATE ON memory_files
  FOR EACH ROW
  EXECUTE FUNCTION memory_files_touch_updated_at();

-- Version snapshot before each content-changing update
CREATE OR REPLACE FUNCTION memory_files_snapshot_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only snapshot when content actually changed (skip metadata-only updates)
  IF OLD.kind = 'file'
     AND (OLD.content IS DISTINCT FROM NEW.content
          OR OLD.sha256 IS DISTINCT FROM NEW.sha256) THEN
    INSERT INTO memory_files_versions (path, content, size_bytes, sha256, changed_by)
    VALUES (OLD.path, OLD.content, OLD.size_bytes, OLD.sha256, COALESCE(NEW.source_origin, 'unknown'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_memory_files_version ON memory_files;
CREATE TRIGGER trg_memory_files_version
  BEFORE UPDATE ON memory_files
  FOR EACH ROW
  EXECUTE FUNCTION memory_files_snapshot_version();

-- ─── Realtime publication ─────────────────────────────────────
-- Enable Supabase Realtime on the table so the web UI gets live updates
-- when the syncer daemon writes from the AI VPS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'memory_files'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE memory_files';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- publication might not exist on a fresh local DB; that's fine
  NULL;
END $$;

-- ─── Helper view ──────────────────────────────────────────────
-- Recursive folder tree, useful for one-shot tree fetches without
-- walking parent_path on the client.
CREATE OR REPLACE VIEW memory_files_tree_v AS
WITH RECURSIVE t AS (
  SELECT path, parent_path, name, kind, size_bytes, updated_at, archived,
         0 AS depth, ARRAY[name] AS path_arr
  FROM memory_files
  WHERE parent_path IS NULL OR parent_path = '/'
  UNION ALL
  SELECT m.path, m.parent_path, m.name, m.kind, m.size_bytes, m.updated_at, m.archived,
         t.depth + 1, t.path_arr || m.name
  FROM memory_files m
  JOIN t ON m.parent_path = t.path
)
SELECT * FROM t ORDER BY path_arr;

COMMENT ON TABLE memory_files IS 'Mirror of /root/memory-vault/ on AI VPS. Source of truth is the file-server; this is for fast UI reads + Realtime broadcasts.';
COMMENT ON TABLE memory_files_versions IS 'Auto-snapshotted on content-changing updates to memory_files. Cap maintained by a periodic cleanup job.';
