-- Persistent agent workspaces and text files.
-- Apply after 001_initial_schema.sql. Existing tables are unchanged.

CREATE TABLE IF NOT EXISTS agent_workspaces (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL DEFAULT 'New project',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_agent_workspaces_owner_id_id UNIQUE (owner_id, id)
);

CREATE INDEX IF NOT EXISTS ix_agent_workspaces_owner_id
    ON agent_workspaces (owner_id);

CREATE TABLE IF NOT EXISTS agent_workspace_files (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES agent_workspaces(id) ON DELETE CASCADE,
    path VARCHAR(240) NOT NULL,
    content TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 1000000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_agent_workspace_files_workspace_path UNIQUE (workspace_id, path)
);

CREATE INDEX IF NOT EXISTS ix_agent_workspace_files_workspace_id
    ON agent_workspace_files (workspace_id);
