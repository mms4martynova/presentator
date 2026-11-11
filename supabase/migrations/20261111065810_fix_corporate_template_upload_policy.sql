/*
# Fix corporate template upload policy

1. Modified Policies
- `insert_own_template_files` on storage.objects (bucket `corporate-templates`).

2. Why
- The previous version compared the folder segment of the template's `name` column instead of the uploaded object's path, so no upload could ever pass the check and saving a template failed.

3. Security
- Uploads are still allowed only into a folder named after a template the caller created.
*/

DROP POLICY IF EXISTS "insert_own_template_files" ON storage.objects;

CREATE POLICY "insert_own_template_files" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'corporate-templates'
  AND EXISTS (
    SELECT 1 FROM templates t
    WHERE t.created_by = auth.uid()
      AND t.id::text = (storage.foldername(objects.name))[1]
  )
);
