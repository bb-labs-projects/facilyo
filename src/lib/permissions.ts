import type { UserRole } from '@/types/database';

// Role hierarchy levels (higher number = more permissions)
const roleHierarchy: Record<UserRole, number> = {
  employee: 1,
  manager: 2,
  owner: 3,
  admin: 4,
};

// Permission check functions

export function canManageProperties(role: UserRole): boolean {
  return ['admin', 'owner', 'manager'].includes(role);
}

export function canManageEmployees(role: UserRole): boolean {
  return ['admin', 'owner', 'manager'].includes(role);
}

export function canManageChecklists(role: UserRole): boolean {
  return ['admin', 'owner', 'manager'].includes(role);
}

export function canConvertMeldungen(role: UserRole): boolean {
  return ['admin', 'owner', 'manager'].includes(role);
}

export function canManageAufgaben(role: UserRole): boolean {
  return ['admin', 'owner', 'manager'].includes(role);
}

export function canAssignAufgaben(role: UserRole): boolean {
  return ['admin', 'owner', 'manager'].includes(role);
}

export function canViewAllUsers(role: UserRole): boolean {
  return ['admin', 'owner', 'manager'].includes(role);
}

export function canUpdateUserRoles(role: UserRole): boolean {
  return ['admin', 'owner', 'manager'].includes(role);
}

export function canAccessAdminPanel(role: UserRole): boolean {
  return ['admin', 'owner', 'manager'].includes(role);
}

export function isPrivilegedRole(role: UserRole): boolean {
  return ['admin', 'owner', 'manager'].includes(role);
}

// Check if a user can assign a specific role to another user
export function canAssignRole(assignerRole: UserRole, targetRole: UserRole): boolean {
  // Can only assign roles below your own level
  return roleHierarchy[assignerRole] > roleHierarchy[targetRole];
}

// Get assignable roles for a user
export function getAssignableRoles(role: UserRole): UserRole[] {
  const level = roleHierarchy[role];
  return (Object.entries(roleHierarchy) as [UserRole, number][])
    .filter(([, lvl]) => lvl < level)
    .map(([r]) => r);
}

// Role labels in German
export const roleLabels: Record<UserRole, string> = {
  admin: 'Administrator',
  owner: 'Eigentümer',
  manager: 'Manager',
  employee: 'Mitarbeiter',
};

// Get display label for role
export function getRoleLabel(role: UserRole): string {
  return roleLabels[role] || role;
}
