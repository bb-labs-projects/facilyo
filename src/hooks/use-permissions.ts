'use client';

import { useMemo } from 'react';
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
  isPrivilegedRole,
  canAssignRole,
  getAssignableRoles,
} from '@/lib/permissions';
import type { UserRole } from '@/types/database';

export interface Permissions {
  // Basic info
  role: UserRole | null;
  isAuthenticated: boolean;

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
  isPrivileged: boolean;

  // Dynamic permission checks
  canAssignRole: (targetRole: UserRole) => boolean;
  getAssignableRoles: () => UserRole[];
}

export function usePermissions(): Permissions {
  const profile = useAuthStore((state) => state.profile);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const role = profile?.role ?? null;

  return useMemo(() => {
    if (!role) {
      return {
        role: null,
        isAuthenticated,
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
        isPrivileged: false,
        canAssignRole: () => false,
        getAssignableRoles: () => [],
      };
    }

    return {
      role,
      isAuthenticated,
      canManageProperties: canManageProperties(role),
      canManageEmployees: canManageEmployees(role),
      canManageChecklists: canManageChecklists(role),
      canConvertMeldungen: canConvertMeldungen(role),
      canManageAufgaben: canManageAufgaben(role),
      canAssignAufgaben: canAssignAufgaben(role),
      canViewAllUsers: canViewAllUsers(role),
      canUpdateUserRoles: canUpdateUserRoles(role),
      canAccessAdminPanel: canAccessAdminPanel(role),
      canManageRolePermissions: canManageRolePermissions(role),
      canManageUserCalendar: canManageUserCalendar(role),
      canDeleteActivity: canDeleteActivity(role),
      isPrivileged: isPrivilegedRole(role),
      canAssignRole: (targetRole: UserRole) => canAssignRole(role, targetRole),
      getAssignableRoles: () => getAssignableRoles(role),
    };
  }, [role, isAuthenticated]);
}
