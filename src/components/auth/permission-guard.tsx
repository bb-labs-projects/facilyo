'use client';

import { ReactNode } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import type { UserRole } from '@/types/database';

interface PermissionGuardProps {
  children: ReactNode;
  // Allow specific roles
  allowedRoles?: UserRole[];
  // Or use permission flags
  requireManageProperties?: boolean;
  requireManageEmployees?: boolean;
  requireManageChecklists?: boolean;
  requireConvertMeldungen?: boolean;
  requireManageAufgaben?: boolean;
  requireAdminPanel?: boolean;
  requirePrivileged?: boolean;
  // Fallback content when not authorized
  fallback?: ReactNode;
  // If true, shows nothing instead of fallback
  hideWhenUnauthorized?: boolean;
}

export function PermissionGuard({
  children,
  allowedRoles,
  requireManageProperties,
  requireManageEmployees,
  requireManageChecklists,
  requireConvertMeldungen,
  requireManageAufgaben,
  requireAdminPanel,
  requirePrivileged,
  fallback = null,
  hideWhenUnauthorized = true,
}: PermissionGuardProps) {
  const permissions = usePermissions();

  // Check if user has required permissions
  const isAuthorized = (() => {
    // If specific roles are required, check those
    if (allowedRoles && allowedRoles.length > 0) {
      if (!permissions.role || !allowedRoles.includes(permissions.role)) {
        return false;
      }
    }

    // Check individual permission requirements
    if (requireManageProperties && !permissions.canManageProperties) return false;
    if (requireManageEmployees && !permissions.canManageEmployees) return false;
    if (requireManageChecklists && !permissions.canManageChecklists) return false;
    if (requireConvertMeldungen && !permissions.canConvertMeldungen) return false;
    if (requireManageAufgaben && !permissions.canManageAufgaben) return false;
    if (requireAdminPanel && !permissions.canAccessAdminPanel) return false;
    if (requirePrivileged && !permissions.isPrivileged) return false;

    return true;
  })();

  if (!isAuthorized) {
    return hideWhenUnauthorized ? null : <>{fallback}</>;
  }

  return <>{children}</>;
}

// Convenience components for common use cases
export function AdminOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <PermissionGuard allowedRoles={['admin']} fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}

export function PrivilegedOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <PermissionGuard requirePrivileged fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}

export function ManagersOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <PermissionGuard allowedRoles={['admin', 'owner', 'manager']} fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}
