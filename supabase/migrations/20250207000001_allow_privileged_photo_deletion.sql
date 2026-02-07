-- Allow privileged users (admin, owner, manager) to delete any photos
-- Needed so task deletion can clean up associated images from storage
CREATE POLICY "Privileged users can delete photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'photos'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner', 'manager')
  )
);
