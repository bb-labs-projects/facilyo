import type { UserRole, PermissionName } from '@/types/database';

// Role hierarchy levels (higher number = more permissions)
const roleHierarchy: Record<UserRole, number> = {
  employee: 1,
  manager: 2,
  owner: 3,
  admin: 4,
};

// Default permissions (fallback when DB is not available)
const defaultPermissions: Record<UserRole, Record<PermissionName, boolean>> = {
  admin: {
    manage_properties: true,
    manage_employees: true,
    manage_checklists: true,
    manage_aufgaben: true,
    assign_aufgaben: true,
    convert_meldungen: true,
    view_all_users: true,
    update_user_roles: true,
    access_admin_panel: true,
    manage_role_permissions: true,
    manage_user_calendar: true,
    delete_activity: true,
    manage_vacations: true,
  },
  owner: {
    manage_properties: true,
    manage_employees: true,
    manage_checklists: true,
    manage_aufgaben: true,
    assign_aufgaben: true,
    convert_meldungen: true,
    view_all_users: true,
    update_user_roles: true,
    access_admin_panel: true,
    manage_role_permissions: true,
    manage_user_calendar: true,
    delete_activity: false,
    manage_vacations: true,
  },
  manager: {
    manage_properties: true,
    manage_employees: true,
    manage_checklists: true,
    manage_aufgaben: true,
    assign_aufgaben: true,
    convert_meldungen: true,
    view_all_users: true,
    update_user_roles: true,
    access_admin_panel: true,
    manage_role_permissions: false,
    manage_user_calendar: false,
    delete_activity: false,
    manage_vacations: false,
  },
  employee: {
    manage_properties: false,
    manage_employees: false,
    manage_checklists: false,
    manage_aufgaben: false,
    assign_aufgaben: false,
    convert_meldungen: false,
    view_all_users: false,
    update_user_roles: false,
    access_admin_panel: false,
    manage_role_permissions: false,
    manage_user_calendar: false,
    delete_activity: false,
    manage_vacations: false,
  },
};

// Permission cache
let permissionsCache: Map<string, boolean> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

// Load permissions from database
export async function loadPermissions(supabase: any): Promise<Map<string, boolean>> {
  if (permissionsCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return permissionsCache;
  }

  try {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('role, permission, enabled');

    if (error) {
      console.error('Failed to load permissions from DB:', error);
      return buildDefaultPermissionsMap();
    }

    const map = new Map<string, boolean>();
    data?.forEach((row: { role: UserRole; permission: PermissionName; enabled: boolean }) => {
      map.set(`${row.role}:${row.permission}`, row.enabled);
    });

    permissionsCache = map;
    cacheTimestamp = Date.now();
    return map;
  } catch (error) {
    console.error('Failed to load permissions:', error);
    return buildDefaultPermissionsMap();
  }
}

// Build default permissions map (fallback)
function buildDefaultPermissionsMap(): Map<string, boolean> {
  const map = new Map<string, boolean>();
  const roles: UserRole[] = ['admin', 'owner', 'manager', 'employee'];
  const permissions: PermissionName[] = [
    'manage_properties',
    'manage_employees',
    'manage_checklists',
    'manage_aufgaben',
    'assign_aufgaben',
    'convert_meldungen',
    'view_all_users',
    'update_user_roles',
    'access_admin_panel',
    'manage_role_permissions',
    'manage_user_calendar',
    'delete_activity',
    'manage_vacations',
  ];

  roles.forEach((role) => {
    permissions.forEach((permission) => {
      map.set(`${role}:${permission}`, defaultPermissions[role][permission]);
    });
  });

  return map;
}

// Check permission from loaded map
export function hasPermissionFromMap(
  permissions: Map<string, boolean>,
  role: UserRole,
  permission: PermissionName
): boolean {
  const key = `${role}:${permission}`;
  const value = permissions.get(key);

  // Fallback to default if not in map
  if (value === undefined) {
    return defaultPermissions[role]?.[permission] ?? false;
  }

  return value;
}

// Clear the permissions cache (call after updating permissions in DB)
export function clearPermissionsCache(): void {
  permissionsCache = null;
  cacheTimestamp = 0;
}

// Legacy permission check functions (use default values as fallback)
// These are kept for backwards compatibility but should use DB permissions when available

export function canManageProperties(role: UserRole): boolean {
  return defaultPermissions[role]?.manage_properties ?? false;
}

export function canManageEmployees(role: UserRole): boolean {
  return defaultPermissions[role]?.manage_employees ?? false;
}

export function canManageChecklists(role: UserRole): boolean {
  return defaultPermissions[role]?.manage_checklists ?? false;
}

export function canConvertMeldungen(role: UserRole): boolean {
  return defaultPermissions[role]?.convert_meldungen ?? false;
}

export function canManageAufgaben(role: UserRole): boolean {
  return defaultPermissions[role]?.manage_aufgaben ?? false;
}

export function canAssignAufgaben(role: UserRole): boolean {
  return defaultPermissions[role]?.assign_aufgaben ?? false;
}

export function canViewAllUsers(role: UserRole): boolean {
  return defaultPermissions[role]?.view_all_users ?? false;
}

export function canUpdateUserRoles(role: UserRole): boolean {
  return defaultPermissions[role]?.update_user_roles ?? false;
}

export function canAccessAdminPanel(role: UserRole): boolean {
  return defaultPermissions[role]?.access_admin_panel ?? false;
}

export function canManageRolePermissions(role: UserRole): boolean {
  return defaultPermissions[role]?.manage_role_permissions ?? false;
}

export function canManageUserCalendar(role: UserRole): boolean {
  return defaultPermissions[role]?.manage_user_calendar ?? false;
}

export function canDeleteActivity(role: UserRole): boolean {
  return defaultPermissions[role]?.delete_activity ?? false;
}

export function canManageVacations(role: UserRole): boolean {
  return defaultPermissions[role]?.manage_vacations ?? false;
}

export function isPrivilegedRole(role: UserRole): boolean {
  return ['admin', 'owner', 'manager'].includes(role);
}

// Check if a user can assign a specific role to another user
export function canAssignRole(assignerRole: UserRole, targetRole: UserRole): boolean {
  // Admin can assign any role including admin
  if (assignerRole === 'admin') {
    return true;
  }
  // Others can only assign roles below their own level
  return roleHierarchy[assignerRole] > roleHierarchy[targetRole];
}

// Get assignable roles for a user
export function getAssignableRoles(role: UserRole): UserRole[] {
  // Admin can assign all roles
  if (role === 'admin') {
    return ['admin', 'owner', 'manager', 'employee'];
  }
  // Others can only assign roles below their level
  const level = roleHierarchy[role];
  return (Object.entries(roleHierarchy) as [UserRole, number][])
    .filter(([, lvl]) => lvl < level)
    .map(([r]) => r);
}

// Check if a user can edit another user's role (considering their current role)
export function canEditUser(editorRole: UserRole, targetUserRole: UserRole): boolean {
  // Admin can edit anyone
  if (editorRole === 'admin') {
    return true;
  }
  // Owner cannot edit admins
  if (editorRole === 'owner' && targetUserRole === 'admin') {
    return false;
  }
  // Can edit users at or below your level (but not admin)
  return roleHierarchy[editorRole] >= roleHierarchy[targetUserRole];
}

// Check if a user can edit permissions for a specific role
export function canEditRolePermissions(editorRole: UserRole, targetRole: UserRole): boolean {
  // Only admin can edit admin permissions
  if (targetRole === 'admin') {
    return editorRole === 'admin';
  }
  // Admin can edit any role's permissions
  if (editorRole === 'admin') {
    return true;
  }
  // Owner can edit permissions for non-admin roles (already checked above)
  if (editorRole === 'owner') {
    return true;
  }
  // Others cannot edit permissions
  return false;
}

// Role labels in German
export const roleLabels: Record<UserRole, string> = {
  admin: 'Administrator',
  owner: 'Eigentümer',
  manager: 'Manager',
  employee: 'Mitarbeiter',
};

// Permission labels in German
export const permissionLabels: Record<PermissionName, string> = {
  manage_properties: 'Liegenschaften verwalten',
  manage_employees: 'Mitarbeiter verwalten',
  manage_checklists: 'Checklisten verwalten',
  manage_aufgaben: 'Aufgaben verwalten',
  assign_aufgaben: 'Aufgaben zuweisen',
  convert_meldungen: 'Meldungen konvertieren',
  view_all_users: 'Alle Benutzer sehen',
  update_user_roles: 'Benutzerrollen ändern',
  access_admin_panel: 'Admin-Panel Zugriff',
  manage_role_permissions: 'Rollen-Berechtigungen verwalten',
  manage_user_calendar: 'Benutzerkalender verwalten',
  delete_activity: 'Aktivitäten löschen',
  manage_vacations: 'Ferien verwalten',
};

// Get all permission names
export const allPermissions: PermissionName[] = [
  'manage_properties',
  'manage_employees',
  'manage_checklists',
  'manage_aufgaben',
  'assign_aufgaben',
  'convert_meldungen',
  'view_all_users',
  'update_user_roles',
  'access_admin_panel',
  'manage_role_permissions',
  'manage_user_calendar',
  'delete_activity',
  'manage_vacations',
];

// Get display label for role
export function getRoleLabel(role: UserRole): string {
  return roleLabels[role] || role;
}

// Get display label for permission
export function getPermissionLabel(permission: PermissionName): string {
  return permissionLabels[permission] || permission;
}
