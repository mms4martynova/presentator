/*
# Allow template owners to delete their template files

1. Modified Policies
- `delete_own_template_files` on storage.objects (bucket `corporate-templates`), new policy.

2. Why
- Deleting a template from the corporate library needs to remove its uploaded
  .pptx files from storage. Without a DELETE policy the files stayed in the
  bucket as orphans after the template row was deleted.

3. Security
- DELETE is allowed only when the caller authored the template that owns the
  folder (first path segment equals the template id, like the INSERT policy).
*/

DROP POLICY IF EXISTS "delete_own_template_files" ON storage.objects;

CREATE POLICY "delete_own_template_files" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'corporate-templates'
  AND EXISTS (
    SELECT 1 FROM templates t
    WHERE t.created_by = auth.uid()
      AND t.id::text = (storage.foldername(objects.name))[1]
  )
);
