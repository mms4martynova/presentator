/*
# Corporate templates: templates, versions, storage

## Purpose
Lets signed-in users keep a shared library of corporate PowerPoint templates.
Each template has descriptive metadata and an append-only history of uploaded
versions. A template's current version can be switched to any earlier version
(rollback) without deleting anything.

## New Tables
- `templates`
  - `id` (uuid, primary key)
  - `created_by` (uuid, defaults to auth.uid()) - author who owns the template
  - `author_name` (text) - display name of the author at creation time
  - `name` (text, not null) - template name
  - `description` (text) - free-form description
  - `brand` (text) - brand or company name
  - `current_version` (int, not null, default 1) - version number in use
  - `created_at`, `updated_at` (timestamptz)
- `template_versions`
  - `id` (uuid, primary key)
  - `template_id` (uuid, FK to templates, cascade delete)
  - `version_number` (int, not null) - unique per template
  - `file_key` (text, not null) - storage path of the uploaded .pptx
  - `file_name` (text) - original file name
  - `theme` (jsonb, not null) - colors, fonts, margins and layout names extracted from the file
  - `change_note` (text) - what changed in this version
  - `created_by` (uuid, defaults to auth.uid())
  - `author_name` (text)
  - `created_at` (timestamptz)

## Storage
- New private bucket `corporate-templates` for uploaded .pptx files.
- Files are stored as `{template_id}/{version_id}.pptx`.

## Security
- RLS enabled on both tables and on the storage objects of the new bucket.
- Any signed-in user can read every template and version (shared corporate library).
- Only the author can create, edit, roll back and delete their own template.
- Versions are append-only: no client update or delete on `template_versions`.
- Uploads into the bucket are allowed only into folders of templates the caller authored.
- Grants are given to `authenticated` only, the app requires sign-in.

## Notes
1. Rollback is a change of `templates.current_version`; old versions stay intact.
2. Deleting a template removes its version rows through the foreign key cascade.
3. Migration is idempotent: safe to re-run.
*/

CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text,
  name text NOT NULL,
  description text,
  brand text,
  current_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  file_key text NOT NULL,
  file_name text,
  theme jsonb NOT NULL,
  change_note text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_template_versions_template ON template_versions(template_id);

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_versions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON templates TO authenticated;
GRANT SELECT, INSERT ON template_versions TO authenticated;

DROP POLICY IF EXISTS "select_shared_templates" ON templates;
CREATE POLICY "select_shared_templates" ON templates FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_templates" ON templates;
CREATE POLICY "insert_own_templates" ON templates FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "update_own_templates" ON templates;
CREATE POLICY "update_own_templates" ON templates FOR UPDATE
  TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "delete_own_templates" ON templates;
CREATE POLICY "delete_own_templates" ON templates FOR DELETE
  TO authenticated USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "select_shared_template_versions" ON template_versions;
CREATE POLICY "select_shared_template_versions" ON template_versions FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM templates t WHERE t.id = template_versions.template_id));

DROP POLICY IF EXISTS "insert_own_template_versions" ON template_versions;
CREATE POLICY "insert_own_template_versions" ON template_versions FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM templates t
      WHERE t.id = template_versions.template_id AND t.created_by = auth.uid()
    )
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('corporate-templates', 'corporate-templates', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "select_shared_template_files" ON storage.objects;
CREATE POLICY "select_shared_template_files" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'corporate-templates');

DROP POLICY IF EXISTS "insert_own_template_files" ON storage.objects;
CREATE POLICY "insert_own_template_files" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'corporate-templates'
    AND EXISTS (
      SELECT 1 FROM templates t
      WHERE t.created_by = auth.uid()
        AND t.id::text = (storage.foldername(name))[1]
    )
  );
