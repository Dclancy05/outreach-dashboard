-- Part B: per-platform cookie snapshots
--
-- Dylan's login modal captures cookies for one platform at a time. Before
-- this, snapshots were stored without a `platform` column, which meant the
-- snapshot row for "instagram" couldn't be distinguished from a later
-- snapshot for "facebook" on the same account. The health check + restore
-- path now needs to know which platform a snapshot belongs to so cookies
-- don't leak across domains on replay.
--
-- Safe to run on a live database: adds a nullable column, no data rewrite,
-- no locking concerns (column add with a NULL default is metadata-only in
-- Postgres 11+).

alter table account_cookie_snapshots
  add column if not exists platform text;

create index if not exists idx_snapshots_account_platform_time
  on account_cookie_snapshots(account_id, platform, captured_at desc);
