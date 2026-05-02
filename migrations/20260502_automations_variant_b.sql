-- W4B Slice 7 — A/B step variants for automations.
--
-- A given automation step (e.g. Instagram's "Send" button) can have its
-- selector change over time. Rather than re-record the whole automation
-- every time, we let the recorder save a fallback (Variant B) selector
-- that the replay engine tries when the primary (Variant A) selector
-- doesn't match.
--
-- Format:
--   variant_b = [
--     { step_index: number, selectors: { css?: string; xpath?: string } },
--     ...
--   ]
--
-- The replay engine runtime logic (try A, fall back to B on miss) is
-- intentionally NOT included in this migration — that lives on the VPS
-- recording-service and lands in a follow-up. This migration plus the
-- step-editor UI are pure data-model + UI; no behavior change yet.

ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS variant_b jsonb;

COMMENT ON COLUMN automations.variant_b IS
  'A/B variant data for steps that need runtime fallback. Format: [{ step_index: int, selectors: { css?: text, xpath?: text } }, ...]';
