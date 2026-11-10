/*
# Storage policies for presentations bucket

## Purpose
Allow authenticated users to upload and download their own presentation files
from the `presentations` storage bucket. Files are stored under
`presentations/{task_id}/{timestamp}.pptx` — the task_id is a uuid that belongs
to the user, so we verify ownership through the tasks table.

## Security
- SELECT (download) policy: user must own the task referenced in the file path.
- INSERT (upload) policy: user must own the task referenced in the file path.
- RLS on storage.objects restricted to `authenticated` role.
*/

-- Enable RLS on storage.objects for this bucket (already enabled by default)
-- Add policies for the presentations bucket
DROP POLICY IF EXISTS "Users can download own presentations" ON storage.objects;
CREATE POLICY "Users can download own presentations"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'presentations'
  AND EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.user_id = auth.uid()
    AND (storage.foldername(name))[1] = tasks.id::text
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
    AND (storage.foldername(name))[1] = tasks.id::text
  )
);
