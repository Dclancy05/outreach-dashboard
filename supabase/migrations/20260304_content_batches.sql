CREATE TABLE IF NOT EXISTS content_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT DEFAULT 'pending',
  config JSONB NOT NULL,
  progress JSONB DEFAULT '{}',
  total_pieces INT DEFAULT 0,
  completed_pieces INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_batches_status ON content_batches(status);
CREATE INDEX IF NOT EXISTS idx_content_batches_created ON content_batches(created_at DESC);
