-- Automations Bridge — Unified View (read-only)
--
-- Context: there are currently TWO automation ecosystems writing to two
-- different tables in this Supabase project:
--
--   1. `automations`  (dashboard — Phase-2 Add Automation modal. Steps
--                      stored inline as jsonb on the row.)
--
--   2. `autobot_automations` + `autobot_steps`
--                     (Chrome extension `AutoBot Recorder` — popup.js
--                      POSTs here when user hits Record. Steps live in
--                      a child table keyed by automation_id.)
--
-- Dylan flagged that these MUST be bridged so a recording made in the
-- extension shows up on /automations. This migration creates a read-only
-- view `v_automations_unified` that UNIONs both tables with a `source`
-- discriminator. The underlying tables are NOT touched.
--
-- Matching API route: /api/automations/list (does the same normalization
-- in application code for cases where the view isn't available — e.g.
-- before this migration has been applied).
--
-- Columns picked are the lowest common denominator so the view works
-- without changing either base table:
--   id (text / uuid both cast to text)
--   source       : 'dashboard' | 'extension'
--   name         : text
--   platform     : text
--   status       : text (normalized — extension 'failing' → 'broken',
--                        extension 'idle' → 'active')
--   tag          : text  (extension category mapped:
--                         'outreach' → 'outreach_action',
--                         'scrape'   → 'lead_enrichment')
--   steps        : jsonb (dashboard: inline column;
--                         extension: aggregated from autobot_steps)
--   health_score : integer
--   created_at   : timestamptz
--   updated_at   : timestamptz
--
-- IMPORTANT: this migration is ADDITIVE ONLY. It creates a view — no
-- ALTER, no DROP, no data movement. It is safe to apply. It is also
-- safe NOT to apply — the /api/automations/list route does not depend
-- on the view existing (it queries the base tables directly).

CREATE OR REPLACE VIEW v_automations_unified AS
  -- Dashboard ecosystem
  SELECT
    a.id::text            AS id,
    'dashboard'::text     AS source,
    a.name,
    a.platform,
    a.status,
    a.tag,
    COALESCE(a.steps, '[]'::jsonb) AS steps,
    COALESCE(a.health_score, 100)  AS health_score,
    a.created_at,
    a.updated_at
  FROM automations a

  UNION ALL

  -- Extension ecosystem (autobot_automations + autobot_steps)
  SELECT
    ab.id::text           AS id,
    'extension'::text     AS source,
    ab.name,
    ab.platform,
    CASE
      WHEN ab.status = 'failing' THEN 'broken'
      WHEN ab.status = 'idle'    THEN 'active'
      ELSE COALESCE(ab.status, 'active')
    END                   AS status,
    CASE
      WHEN ab.category = 'outreach' THEN 'outreach_action'
      WHEN ab.category = 'scrape'   THEN 'lead_enrichment'
      ELSE NULL
    END                   AS tag,
    COALESCE(
      (
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'index',       s.sort_order,
                   'kind',        s.type,
                   'description', s.description,
                   'selectors',   jsonb_build_object('css', s.selector),
                   'url',         s.url,
                   'value',       s.value
                 )
                 ORDER BY s.sort_order
               )
        FROM autobot_steps s
        WHERE s.automation_id = ab.id
      ),
      '[]'::jsonb
    )                     AS steps,
    CASE WHEN ab.status = 'failing' THEN 50 ELSE 100 END AS health_score,
    ab.created_at,
    COALESCE(ab.last_run_at, ab.created_at) AS updated_at
  FROM autobot_automations ab;

-- Grant read access to the same roles that can read the base tables.
-- (Supabase's default `anon` + `authenticated` roles already have SELECT
-- on both source tables; the view inherits via the underlying SELECTs.)
GRANT SELECT ON v_automations_unified TO anon, authenticated, service_role;

COMMENT ON VIEW v_automations_unified IS
  'Read-only union of automations (dashboard) + autobot_automations+autobot_steps (extension). Backs /api/automations/list.';
