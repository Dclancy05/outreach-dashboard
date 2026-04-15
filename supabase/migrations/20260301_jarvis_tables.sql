-- Jarvis Command Center Tables
-- Created: 2026-03-01

-- Tasks (Kanban board)
CREATE TABLE IF NOT EXISTS jarvis_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  assigned_agent TEXT,
  estimated_minutes INTEGER,
  created_by TEXT DEFAULT 'dylan',
  result_summary TEXT,
  report_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Activity Log
CREATE TABLE IF NOT EXISTS jarvis_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT now(),
  agent_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'warning', 'error', 'idea', 'build')),
  details_json JSONB
);

-- Ideas
CREATE TABLE IF NOT EXISTS jarvis_ideas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'feature' CHECK (category IN ('business', 'feature', 'cost_saving', 'growth')),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'approved', 'dismissed', 'completed')),
  source TEXT DEFAULT 'proactive',
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ
);

-- Reports
CREATE TABLE IF NOT EXISTS jarvis_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'build_report',
  content_md TEXT,
  screenshots_json JSONB,
  agent_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Inbox
CREATE TABLE IF NOT EXISTS jarvis_inbox (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('approve', 'paste_key', 'review', 'question')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'dismissed')),
  action_data_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_jarvis_tasks_status ON jarvis_tasks(status);
CREATE INDEX idx_jarvis_activity_log_timestamp ON jarvis_activity_log(timestamp DESC);
CREATE INDEX idx_jarvis_ideas_status ON jarvis_ideas(status);
CREATE INDEX idx_jarvis_inbox_status ON jarvis_inbox(status);
