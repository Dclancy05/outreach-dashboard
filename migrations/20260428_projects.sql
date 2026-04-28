-- Projects table for the /agency/memory#project-tree tab.
-- Each row is a GitHub repository whose source code can be browsed read-only
-- from the dashboard. The first row (agency-hq) is the dashboard's own repo.
-- Future projects each get their own row + virtual top-level folder.

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  github_owner TEXT NOT NULL,
  github_repo TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  blocklist_globs TEXT[] NOT NULL DEFAULT ARRAY[
    'node_modules/**', '.next/**', '.git/**', '.vercel/**', '.claude/**',
    'dist/**', 'build/**', 'out/**', 'coverage/**',
    '.env', '.env.local', '.env.production', '.env.development',
    '**/*.pem', '**/*.key', '**/*.crt', '**/*.p12',
    '**/cookies*', '**/credentials*'
  ]::TEXT[],
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_sort ON projects(sort_order, slug);

-- Seed: this repo as the first project. Idempotent on slug.
INSERT INTO projects (slug, display_name, github_owner, github_repo, branch, sort_order)
VALUES ('agency-hq', 'Agency HQ', 'Dclancy05', 'outreach-github', 'main', 0)
ON CONFLICT (slug) DO NOTHING;
