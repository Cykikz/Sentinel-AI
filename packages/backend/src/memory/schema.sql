PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  scan_type TEXT NOT NULL CHECK (scan_type IN ('deep', 'commit', 'manual', 'test')),
  health_score INTEGER CHECK (health_score BETWEEN 0 AND 100),
  files_scanned INTEGER NOT NULL DEFAULT 0,
  issues_found INTEGER NOT NULL DEFAULT 0,
  issues_fixed INTEGER NOT NULL DEFAULT 0,
  changed_files TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS findings (
  id INTEGER PRIMARY KEY,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO')),
  category TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line_number INTEGER,
  description TEXT NOT NULL,
  fix_applied INTEGER NOT NULL DEFAULT 0 CHECK (fix_applied IN (0, 1)),
  fix_description TEXT,
  original_code TEXT,
  bob_fix_code TEXT,
  blast_radius TEXT NOT NULL DEFAULT '{}',
  verification_status TEXT NOT NULL DEFAULT 'PENDING',
  verification_reason TEXT,
  confidence INTEGER,
  timestamp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY,
  rule_text TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  violations_found INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS health_history (
  id INTEGER PRIMARY KEY,
  scan_id INTEGER REFERENCES scans(id) ON DELETE SET NULL,
  timestamp INTEGER NOT NULL,
  overall_score INTEGER CHECK (overall_score BETWEEN 0 AND 100),
  security_score INTEGER CHECK (security_score BETWEEN 0 AND 100),
  architecture_score INTEGER CHECK (architecture_score BETWEEN 0 AND 100),
  hygiene_score INTEGER CHECK (hygiene_score BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS contributors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  risky_commits INTEGER NOT NULL DEFAULT 0,
  issues_introduced INTEGER NOT NULL DEFAULT 0,
  issues_fixed INTEGER NOT NULL DEFAULT 0,
  expertise_areas TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS git_history (
  id INTEGER PRIMARY KEY,
  commit_hash TEXT NOT NULL UNIQUE,
  author TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  files_changed TEXT NOT NULL DEFAULT '[]',
  message TEXT,
  introduced_issues INTEGER NOT NULL DEFAULT 0,
  fixed_issues INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS repository_snapshots (
  id INTEGER PRIMARY KEY,
  scan_id INTEGER REFERENCES scans(id) ON DELETE SET NULL,
  timestamp INTEGER NOT NULL,
  root_path TEXT NOT NULL,
  framework TEXT NOT NULL,
  total_files INTEGER NOT NULL DEFAULT 0,
  source_files INTEGER NOT NULL DEFAULT 0,
  orphaned_files TEXT NOT NULL DEFAULT '[]',
  high_risk_files TEXT NOT NULL DEFAULT '[]',
  dependency_graph TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS file_graph (
  id INTEGER PRIMARY KEY,
  snapshot_id INTEGER NOT NULL REFERENCES repository_snapshots(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  imports TEXT NOT NULL DEFAULT '[]',
  imported_by TEXT NOT NULL DEFAULT '[]',
  risk_score INTEGER NOT NULL DEFAULT 0,
  UNIQUE(snapshot_id, file_path)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  scan_id INTEGER REFERENCES scans(id) ON DELETE SET NULL,
  timestamp INTEGER NOT NULL,
  report_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scans_timestamp ON scans(timestamp);
CREATE INDEX IF NOT EXISTS idx_findings_scan_id ON findings(scan_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
CREATE INDEX IF NOT EXISTS idx_health_history_timestamp ON health_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_git_history_timestamp ON git_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_repository_snapshots_timestamp ON repository_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_file_graph_snapshot_id ON file_graph(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_reports_scan_id ON reports(scan_id);
