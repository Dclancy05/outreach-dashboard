-- Bug #25 follow-up: private Supabase storage bucket for self-test screenshots.
--
-- The agent-repair flow needs to hand a Claude Code subagent a real screenshot
-- of the failed page so it can propose new selectors. Vercel routes can't
-- write to the VPS filesystem, and the Read tool can't decode `data:image/png`
-- URLs. The fix: upload to a private Supabase bucket and pass a short-lived
-- (5-minute) signed URL the subagent `curl`s before calling Read.
--
-- This bucket is service-role only — no anon / authenticated access. URLs are
-- short-lived signed URLs minted server-side per repair attempt.
--
-- Idempotent: safe to re-run.

INSERT INTO storage.buckets (id, name, public)
VALUES ('automation-screenshots', 'automation-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- RLS on storage.objects: service_role only for this bucket.
-- The table-level RLS is already enabled by Supabase; we just add scoped
-- policies so service-role access is explicit and anon/authenticated stay
-- locked out.

DROP POLICY IF EXISTS "automation-screenshots service role select"
  ON storage.objects;
CREATE POLICY "automation-screenshots service role select"
  ON storage.objects
  FOR SELECT
  TO service_role
  USING (bucket_id = 'automation-screenshots');

DROP POLICY IF EXISTS "automation-screenshots service role insert"
  ON storage.objects;
CREATE POLICY "automation-screenshots service role insert"
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'automation-screenshots');

DROP POLICY IF EXISTS "automation-screenshots service role delete"
  ON storage.objects;
CREATE POLICY "automation-screenshots service role delete"
  ON storage.objects
  FOR DELETE
  TO service_role
  USING (bucket_id = 'automation-screenshots');

-- Rollback:
--   DROP POLICY IF EXISTS "automation-screenshots service role select" ON storage.objects;
--   DROP POLICY IF EXISTS "automation-screenshots service role insert" ON storage.objects;
--   DROP POLICY IF EXISTS "automation-screenshots service role delete" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'automation-screenshots';
