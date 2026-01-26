'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';
import {
  roleLabels,
  permissionLabels,
  allPermissions,
  clearPermissionsCache,
} from '@/lib/permissions';
import { cn } from '@/lib/utils';
import type { UserRole, PermissionName, RolePermission } from '@/types/database';

const roles: UserRole[] = ['admin', 'owner', 'manager', 'employee'];

export default function AdminRolesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const permissions = usePermissions();

  const [selectedRole, setSelectedRole] = useState<UserRole>('admin');

  // Fetch all role permissions
  const { data: rolePermissions = [], isLoading } = useQuery({
    queryKey: ['role-permissions'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('role_permissions')
        .select('*')
        .order('role');

      if (error) throw error;
      return data as RolePermission[];
    },
  });

  // Get permission state for a role
  const getPermissionEnabled = (role: UserRole, permission: PermissionName): boolean => {
    const found = rolePermissions.find(
      (rp) => rp.role === role && rp.permission === permission
    );
    return found?.enabled ?? false;
  };

  // Update permission mutation
  const updatePermissionMutation = useMutation({
    mutationFn: async ({
      role,
      permission,
      enabled,
    }: {
      role: UserRole;
      permission: PermissionName;
      enabled: boolean;
    }) => {
      const supabase = getClient();
      const { error } = await (supabase as any)
        .from('role_permissions')
        .update({ enabled })
        .eq('role', role)
        .eq('permission', permission);

      if (error) throw error;
      return { role, permission, enabled };
    },
    onSuccess: () => {
      toast.success('Berechtigung aktualisiert');
      clearPermissionsCache();
      queryClient.invalidateQueries({ queryKey: ['role-permissions'] });
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // Redirect if no permission
  useEffect(() => {
    if (!permissions.canManageRolePermissions) {
      router.push('/admin');
    }
  }, [permissions.canManageRolePermissions, router]);

  if (!permissions.canManageRolePermissions) {
    return null;
  }

  const handleTogglePermission = (permission: PermissionName) => {
    const currentEnabled = getPermissionEnabled(selectedRole, permission);
    updatePermissionMutation.mutate({
      role: selectedRole,
      permission,
      enabled: !currentEnabled,
    });
  };

  return (
    <PageContainer
      header={<Header title="Rollen & Berechtigungen" showBack />}
    >
      {/* Role Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {roles.map((role) => (
          <button
            key={role}
            onClick={() => setSelectedRole(role)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
              selectedRole === role
                ? 'bg-primary-600 text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {roleLabels[role]}
          </button>
        ))}
      </div>

      {/* Permissions List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Wird geladen...
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {allPermissions.map((permission) => {
                const isEnabled = getPermissionEnabled(selectedRole, permission);
                const isPending = updatePermissionMutation.isPending;

                return (
                  <button
                    key={permission}
                    onClick={() => handleTogglePermission(permission)}
                    disabled={isPending}
                    className={cn(
                      'w-full flex items-center justify-between p-4 text-left transition-colors',
                      'hover:bg-muted/50',
                      isPending && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Shield className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium">{permissionLabels[permission]}</span>
                    </div>
                    <div
                      className={cn(
                        'w-6 h-6 rounded border-2 flex items-center justify-center transition-colors',
                        isEnabled
                          ? 'bg-primary-600 border-primary-600'
                          : 'border-muted-foreground'
                      )}
                    >
                      {isEnabled && <Check className="w-4 h-4 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Note */}
      <div className="mt-6 p-4 rounded-lg bg-blue-50 border border-blue-200">
        <p className="text-sm text-blue-700">
          <strong>Hinweis:</strong> Änderungen an Berechtigungen werden sofort wirksam.
          Benutzer müssen sich möglicherweise neu anmelden, damit alle Änderungen sichtbar werden.
        </p>
      </div>
    </PageContainer>
  );
}
