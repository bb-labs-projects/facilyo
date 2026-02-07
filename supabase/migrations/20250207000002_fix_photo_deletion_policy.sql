-- Fix: Use get_my_role() instead of querying profiles directly
-- Direct profiles query is blocked by RLS recursion protection
DROP POLICY IF EXISTS "Privileged users can delete photos" ON storage.objects;

CREATE POLICY "Privileged users can delete photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'photos'
  AND public.get_my_role() IN ('admin', 'owner', 'manager')
);
