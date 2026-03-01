-- Fix storage DELETE and UPDATE policies.
-- The "own" policies incorrectly checked for user ID as the second path segment,
-- but upload paths use {org_id}/{category}/{file} (e.g. {org_id}/issues/{file}).
-- Simplify: any authenticated user within the org can delete/update photos in their org.
-- Issue/task deletion is already gated by table-level RLS (admin/owner/manager only).

DROP POLICY IF EXISTS "Org-scoped own photo deletion" ON storage.objects;
DROP POLICY IF EXISTS "Org-scoped privileged photo deletion" ON storage.objects;
DROP POLICY IF EXISTS "Org-scoped photo updates" ON storage.objects;

-- DELETE: Any authenticated user can delete photos within their org
CREATE POLICY "Org-scoped photo deletion"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] = public.get_my_org_id()::text
);

-- UPDATE: Any authenticated user can update photos within their org
CREATE POLICY "Org-scoped photo updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] = public.get_my_org_id()::text
);
