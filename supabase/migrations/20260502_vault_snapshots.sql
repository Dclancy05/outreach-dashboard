-- Daily snapshots of every markdown file in the memory vault.
-- Enables Time Machine UI to reconstruct the tree at any past date.
--
-- Storage strategy: when a file's content_hash matches the previous
-- snapshot, we still record a row but set content=NULL and
-- content_ref_date to point at the earlier row. This keeps "what
-- existed at this date" queryable without storing duplicate content.

CREATE TABLE IF NOT EXISTS vault_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  file_path text NOT NULL,
  content text,
  content_hash text NOT NULL,
  size_bytes integer,
  content_ref_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, file_path)
);

CREATE INDEX IF NOT EXISTS idx_vault_snapshots_path_date
  ON vault_snapshots(file_path, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_vault_snapshots_date
  ON vault_snapshots(snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_vault_snapshots_hash
  ON vault_snapshots(content_hash);
