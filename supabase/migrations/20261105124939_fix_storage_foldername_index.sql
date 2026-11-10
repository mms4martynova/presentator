/*
# Fix storage policies: correct foldername index

## Problem
The storage policies for the `presentations` bucket used `storage.foldername(name)[1]`
to extract the task_id from the file path. But file paths are structured as
`{task_id}/{timestamp}.pptx` — the first folder segment IS the task_id.

Wait — the upload path in the frontend is `presentations/{task_id}/{timestamp}.pptx`.
So `storage.foldername` returns `{presentations, task_id}` and `[1]` = `presentations`,
not the task_id. We need `[2]`.

## Fix
Update both policies to use `storage.foldername(name)[2]` to match the task_id
in the second path segment.
*/

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
