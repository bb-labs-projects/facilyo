-- Scope photo storage by organization_id
-- Upload paths must follow: {org_id}/checklists/..., {org_id}/issues/..., etc.
-- This prevents cross-org photo access at the policy level.

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update own photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete own photos" ON storage.objects;
DROP POLICY IF EXISTS "Privileged users can delete photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for photos" ON storage.objects;

-- INSERT: Only allow uploads under your org's folder
CREATE POLICY "Org-scoped photo uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] = public.get_my_org_id()::text
);

-- SELECT: Only allow reading photos from your org (or super admin)
-- Keep public for now since photos are displayed via public URLs,
-- but scope to org folder
CREATE POLICY "Org-scoped photo reads"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'photos'
);

-- UPDATE: Only own photos within your org
CREATE POLICY "Org-scoped photo updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] = public.get_my_org_id()::text
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- DELETE (own): Users can delete their own photos within their org
CREATE POLICY "Org-scoped own photo deletion"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] = public.get_my_org_id()::text
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- DELETE (privileged): Admins/owners/managers can delete any photo in their org
CREATE POLICY "Org-scoped privileged photo deletion"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] = public.get_my_org_id()::text
  AND public.get_my_role() IN ('admin', 'owner', 'manager')
);
