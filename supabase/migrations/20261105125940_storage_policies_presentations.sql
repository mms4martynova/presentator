/*
# Storage policies for presentations bucket

## Purpose
Allow authenticated users to upload and download their own presentation files
from the `presentations` storage bucket. Files are stored under
`presentations/{task_id}/{timestamp}.pptx`.

## Security
- SELECT (download) policy: user must own the task referenced in the file path.
- INSERT (upload) policy: user must own the task referenced in the file path.
- The second path segment (storage.foldername(name)[2]) is the task_id.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('presentations', 'presentations', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can download own presentations" ON storage.objects;
CREATE POLICY "Users can download own presentations"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'presentations'
  AND EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.user_id = auth.uid()
    AND (storage.foldername(name))[2] = tasks.id::text
  )
);

DROP POLICY IF EXISTS "Users can upload own presentations" ON storage.objects;
CREATE POLICY "Users can upload own presentations"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'presentations'
  AND EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.user_id = auth.uid()
    AND (storage.foldername(name))[2] = tasks.id::text
  )
);
