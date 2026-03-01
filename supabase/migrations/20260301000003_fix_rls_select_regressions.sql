-- Fix three SELECT policy regressions introduced by the multi-tenancy migration:
-- 1. checklist_item_completions: admins/managers can't see other users' completions
-- 2. aufgaben: workers can't see tasks for their assigned properties
-- 3. vacation_requests: employees can't see approved requests of colleagues

-- ----- 1. checklist_item_completions: add privileged read -----
DROP POLICY IF EXISTS "checklist_item_completions_select" ON checklist_item_completions;

CREATE POLICY "checklist_item_completions_select"
  ON checklist_item_completions FOR SELECT
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        checklist_instance_id IN (
          SELECT ci.id FROM checklist_instances ci
          JOIN time_entries te ON te.id = ci.time_entry_id
          WHERE te.user_id = auth.uid()
        )
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

-- ----- 2. aufgaben: restore property-based visibility for workers -----
DROP POLICY IF EXISTS "aufgaben_select" ON aufgaben;

CREATE POLICY "aufgaben_select"
  ON aufgaben FOR SELECT
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        assigned_to = auth.uid()
        OR created_by = auth.uid()
        OR property_id IN (
          SELECT property_id FROM property_assignments WHERE user_id = auth.uid()
        )
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
      )
    )
    OR public.is_super_admin()
  );

-- ----- 3. vacation_requests: allow employees to see approved requests in their org -----
DROP POLICY IF EXISTS "vacation_requests_select" ON vacation_requests;

CREATE POLICY "vacation_requests_select"
  ON vacation_requests FOR SELECT
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        user_id = auth.uid()
        OR public.get_my_role() IN ('admin', 'owner', 'manager')
        OR status = 'approved'
      )
    )
    OR public.is_super_admin()
  );
