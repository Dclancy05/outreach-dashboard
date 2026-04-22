-- Cookie persistence hardening + per-account fingerprint system
-- Note: accounts.account_id is TEXT (not uuid) in this schema.

-- 1. Cookie health columns on accounts
alter table accounts
  add column if not exists cookies_updated_at timestamptz,
  add column if not exists cookies_health text default 'unknown',
  add column if not exists cookies_last_check timestamptz,
  add column if not exists last_successful_login timestamptz;

-- 2. Cookie snapshot history table
create table if not exists account_cookie_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(account_id) on delete cascade,
  cookies_json jsonb not null,
  local_storage_json jsonb,
  captured_at timestamptz default now(),
  captured_by text,
  cookie_count int,
  session_id text
);
create index if not exists idx_snapshots_account_time
  on account_cookie_snapshots(account_id, captured_at desc);

-- 3. Per-account fingerprint table
create table if not exists account_fingerprints (
  account_id text primary key references accounts(account_id) on delete cascade,
  user_agent text not null,
  platform text not null,
  screen_width int not null,
  screen_height int not null,
  device_pixel_ratio numeric not null,
  color_depth int not null default 24,
  hardware_concurrency int not null,
  device_memory int not null,
  webgl_vendor text not null,
  webgl_renderer text not null,
  canvas_noise_seed text not null,
  audio_noise_seed text not null,
  timezone text,
  locale text,
  accept_language text,
  geo_lat numeric,
  geo_lon numeric,
  proxy_group_id text,
  chrome_profile_dir text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. Onboarding completion tracking (optional, keyed by user email or admin pin)
create table if not exists onboarding_status (
  id text primary key,
  completed_at timestamptz,
  current_step int default 0,
  updated_at timestamptz default now()
);
