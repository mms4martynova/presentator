/*
# Create tasks table for Presentator

## Purpose
Stores presentation generation tasks. Each authenticated user sees only their own tasks.

## New Tables
- `tasks`
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK to auth.users, defaults to auth.uid()) — task owner
  - `parent_task_id` (uuid, nullable, self-ref) — for rebuild chains
  - `title` (text, not null) — presentation title
  - `status` (text, not null, default 'queued') — queued|processing|completed|failed
  - `progress` (int, not null, default 0) — 0-100
  - `want_pdf` (boolean, not null, default false)
  - `request` (jsonb, not null) — the full TaskCreate payload
  - `outline` (jsonb, nullable) — resolved slide specs
  - `pptx_key` (text, nullable) — storage path for generated PPTX
  - `pdf_key` (text, nullable) — storage path for generated PDF
  - `error` (text, nullable) — error message if failed
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

## Security
- RLS enabled on `tasks`.
- CRUD granted to `authenticated` only (app requires sign-in).
- Owner-scoped policies: users can only access their own tasks.
- user_id defaults to auth.uid() so inserts without explicit user_id succeed.
*/

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  progress int NOT NULL DEFAULT 0,
  want_pdf boolean NOT NULL DEFAULT false,
  request jsonb NOT NULL,
  outline jsonb,
  pptx_key text,
  pdf_key text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO authenticated;

DROP POLICY IF EXISTS "select_own_tasks" ON tasks;
CREATE POLICY "select_own_tasks" ON tasks FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_tasks" ON tasks;
CREATE POLICY "insert_own_tasks" ON tasks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_tasks" ON tasks;
CREATE POLICY "update_own_tasks" ON tasks FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_tasks" ON tasks;
CREATE POLICY "delete_own_tasks" ON tasks FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tasks_user_created ON tasks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
