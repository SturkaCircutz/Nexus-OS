CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  layout TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS window_states (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  title TEXT NOT NULL,
  x INTEGER DEFAULT 0,
  y INTEGER DEFAULT 0,
  width INTEGER DEFAULT 800,
  height INTEGER DEFAULT 600,
  workspace_id TEXT,
  monitor INTEGER DEFAULT 0,
  is_external INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS agent_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- AI Core canonical records (docs/AI-Core/05-reference-glossary.md, diagram D6)
-- Sessions, requests, tasks, proposals, approvals, executions, receipts,
-- memory/artifact metadata, and audit. Each core row keeps the canonical
-- contract JSON in ``payload`` for fidelity; indexed columns are the ones
-- queries actually need. Index projections (memory_index) are rebuildable.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
  request_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  parent_request_id TEXT,
  user_input TEXT NOT NULL,
  status TEXT NOT NULL,
  route TEXT,
  response_text TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(request_id),
  parent_task_id TEXT,
  assigned_to TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_runs (
  run_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  agent TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS tool_proposals (
  proposal_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  request_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  tool_version TEXT NOT NULL,
  risk TEXT NOT NULL,
  side_effect INTEGER NOT NULL,
  proposal_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_requests (
  approval_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES tool_proposals(proposal_id),
  proposal_fingerprint TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS tool_executions (
  execution_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES tool_proposals(proposal_id),
  idempotency_key TEXT NOT NULL,
  approval_id TEXT,
  tool_id TEXT NOT NULL,
  fingerprint_verified INTEGER NOT NULL,
  started_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_receipts (
  execution_id TEXT PRIMARY KEY REFERENCES tool_executions(execution_id),
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  output_ref TEXT,
  error TEXT,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_proposals (
  proposal_id TEXT PRIMARY KEY,
  source_request_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  kind TEXT NOT NULL,
  content_ref TEXT NOT NULL,
  confidence REAL NOT NULL,
  sensitivity TEXT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  memory_id TEXT PRIMARY KEY,
  tier TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  title TEXT,
  provenance_refs TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL,
  sensitivity TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  content_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_sources (
  memory_id TEXT NOT NULL REFERENCES memories(memory_id),
  source_ref TEXT NOT NULL
);

-- Rebuildable retrieval projection keyed to canonical records (doc 02).
CREATE TABLE IF NOT EXISTS memory_index (
  memory_id TEXT NOT NULL REFERENCES memories(memory_id),
  revision INTEGER NOT NULL,
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_artifacts (
  artifact_id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  media_type TEXT NOT NULL,
  title TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  event_id TEXT PRIMARY KEY,
  request_id TEXT,
  task_id TEXT,
  event_type TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
