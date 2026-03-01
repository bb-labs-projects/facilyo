-- Low-severity RLS cleanup:
-- 1. Drop orphaned has_calendar_management_role() function (dead code since multi-tenancy migration)
-- 2. Document intentional policy gaps on profiles and auth_credentials

-- 1. Drop dead function
DROP FUNCTION IF EXISTS public.has_calendar_management_role();

-- 2. Documentation comments (no schema changes)

-- profiles: No INSERT policy — profiles are created only via the handle_new_user()
-- SECURITY DEFINER trigger and create_organization() function.
-- No DELETE policy — profile deletion cascades from auth.users deletion.
-- This is intentional: admins cannot insert or delete profiles via the client API.
COMMENT ON TABLE profiles IS 'RLS note: INSERT and DELETE are intentionally not exposed via client policies. Profiles are created by handle_new_user() trigger and deleted via auth.users cascade.';

-- auth_credentials: No INSERT/UPDATE/DELETE policies — all write operations are
-- performed by API routes using the service role key, which bypasses RLS.
-- This is intentional to prevent client-side credential manipulation.
COMMENT ON TABLE auth_credentials IS 'RLS note: INSERT, UPDATE, DELETE are intentionally not exposed via client policies. All writes use the service role key.';
