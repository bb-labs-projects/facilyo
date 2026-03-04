'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import {
  canManageProperties,
  canManageEmployees,
  canManageChecklists,
  canConvertMeldungen,
  canManageAufgaben,
  canAssignAufgaben,
  canViewAllUsers,
  canUpdateUserRoles,
  canAccessAdminPanel,
  canManageRolePermissions,
  canManageUserCalendar,
  canDeleteActivity,
  canManageVacations,
  canManageInvoices,
  isPrivilegedRole,
  canAssignRole,
  getAssignableRoles,
  loadPermissions,
  hasPermissionFromMap,
} from '@/lib/permissions';
import { getClient } from '@/lib/supabase/client';
import type { UserRole } from '@/types/database';

export interface Permissions {
  // Basic info
  role: UserRole | null;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;

  // Permission flags
  canManageProperties: boolean;
  canManageEmployees: boolean;
  canManageChecklists: boolean;
  canConvertMeldungen: boolean;
  canManageAufgaben: boolean;
  canAssignAufgaben: boolean;
  canViewAllUsers: boolean;
  canUpdateUserRoles: boolean;
  canAccessAdminPanel: boolean;
  canManageRolePermissions: boolean;
  canManageUserCalendar: boolean;
  canDeleteActivity: boolean;
  canManageVacations: boolean;
  canManageInvoices: boolean;
  isPrivileged: boolean;

  // Dynamic permission checks
  canAssignRole: (targetRole: UserRole) => boolean;
  getAssignableRoles: () => UserRole[];
}

export function usePermissions(): Permissions {
  const profile = useAuthStore((state) => state.profile);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const organizationId = useAuthStore((state) => state.organizationId);
  const isSuperAdmin = useAuthStore((state) => state.isSuperAdmin);

  const role = profile?.role ?? null;

  // Load permissions from database, falling back to defaults (scoped by org)
  const { data: dbPermissions } = useQuery({
    queryKey: ['role-permissions', organizationId],
    queryFn: () => loadPermissions(getClient(), organizationId || undefined),
    staleTime: 60000, // 1 minute
    enabled: !!role,
  });

  return useMemo(() => {
    if (!role) {
      return {
        role: null,
        isAuthenticated,
        isSuperAdmin: false,
        canManageProperties: false,
        canManageEmployees: false,
        canManageChecklists: false,
        canConvertMeldungen: false,
        canManageAufgaben: false,
        canAssignAufgaben: false,
        canViewAllUsers: false,
        canUpdateUserRoles: false,
        canAccessAdminPanel: false,
        canManageRolePermissions: false,
        canManageUserCalendar: false,
        canDeleteActivity: false,
        canManageVacations: false,
        canManageInvoices: false,
        isPrivileged: false,
        canAssignRole: () => false,
        getAssignableRoles: () => [],
      };
    }

    // Super admins have all permissions
    if (isSuperAdmin) {
      return {
        role,
        isAuthenticated,
        isSuperAdmin: true,
        canManageProperties: true,
        canManageEmployees: true,
        canManageChecklists: true,
        canConvertMeldungen: true,
        canManageAufgaben: true,
        canAssignAufgaben: true,
        canViewAllUsers: true,
        canUpdateUserRoles: true,
        canAccessAdminPanel: true,
        canManageRolePermissions: true,
        canManageUserCalendar: true,
        canDeleteActivity: true,
        canManageVacations: true,
        canManageInvoices: true,
        isPrivileged: true,
        canAssignRole: () => true,
        getAssignableRoles: () => ['admin', 'owner', 'manager', 'employee'] as UserRole[],
      };
    }

    // Use DB permissions if loaded, otherwise fall back to hardcoded defaults
    const check = dbPermissions
      ? (permission: Parameters<typeof hasPermissionFromMap>[2]) =>
          hasPermissionFromMap(dbPermissions, role, permission)
      : null;

    return {
      role,
      isAuthenticated,
      isSuperAdmin: false,
      canManageProperties: check ? check('manage_properties') : canManageProperties(role),
      canManageEmployees: check ? check('manage_employees') : canManageEmployees(role),
      canManageChecklists: check ? check('manage_checklists') : canManageChecklists(role),
      canConvertMeldungen: check ? check('convert_meldungen') : canConvertMeldungen(role),
      canManageAufgaben: check ? check('manage_aufgaben') : canManageAufgaben(role),
      canAssignAufgaben: check ? check('assign_aufgaben') : canAssignAufgaben(role),
      canViewAllUsers: check ? check('view_all_users') : canViewAllUsers(role),
      canUpdateUserRoles: check ? check('update_user_roles') : canUpdateUserRoles(role),
      canAccessAdminPanel: check ? check('access_admin_panel') : canAccessAdminPanel(role),
      canManageRolePermissions: check ? check('manage_role_permissions') : canManageRolePermissions(role),
      canManageUserCalendar: check ? check('manage_user_calendar') : canManageUserCalendar(role),
      canDeleteActivity: check ? check('delete_activity') : canDeleteActivity(role),
      canManageVacations: check ? check('manage_vacations') : canManageVacations(role),
      canManageInvoices: check ? check('manage_invoices') : canManageInvoices(role),
      isPrivileged: isPrivilegedRole(role),
      canAssignRole: (targetRole: UserRole) => canAssignRole(role, targetRole),
      getAssignableRoles: () => getAssignableRoles(role),
    };
  }, [role, isAuthenticated, isSuperAdmin, dbPermissions]);
}
