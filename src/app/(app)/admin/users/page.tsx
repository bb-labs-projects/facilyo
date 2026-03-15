'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Shield, Building2, Search, UserPlus, KeyRound, Unlock, AlertCircle, Power, Palmtree } from 'lucide-react';
import { toast } from 'sonner';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { TempPasswordDialog } from './components/temp-password-dialog';
import { ResetPasswordDialog } from './components/reset-password-dialog';
import { useAuthStore } from '@/stores/auth-store';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';
import { roleLabels, getAssignableRoles, canEditUser } from '@/lib/permissions';
import { getInitials, cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { ErrorBoundary } from '@/components/error-boundary';
import type { Profile, Property, UserRole } from '@/types/database';

interface AuthCredentials {
  id: string;
  user_id: string;
  username: string;
  must_change_password: boolean;
  locked_until: string | null;
  failed_attempts: number;
}

interface UserWithAssignments extends Profile {
  organizations?: { name: string };
  property_assignments: { property_id: string; property: Property }[];
  auth_credentials?: AuthCredentials[];
}

export default function AdminUsersPage() {
  return (
    <ErrorBoundary>
      <AdminUsersPageContent />
    </ErrorBoundary>
  );
}

function AdminUsersPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const organizationId = useAuthStore((state) => state.organizationId);
  const isSuperAdmin = useAuthStore((state) => state.isSuperAdmin);
  const permissions = usePermissions();
  const t = useTranslations();
  const tUsers = useTranslations('usersAdmin');

  const [searchQuery, setSearchQuery] = useState('');
  const [showInactiveUsers, setShowInactiveUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithAssignments | null>(null);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showAssignmentsSheet, setShowAssignmentsSheet] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);
  const [showTempPasswordDialog, setShowTempPasswordDialog] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showVacationDaysDialog, setShowVacationDaysDialog] = useState(false);
  const [vacationDaysValue, setVacationDaysValue] = useState<number>(25);
  const [tempPasswordData, setTempPasswordData] = useState<{
    username: string;
    tempPassword: string;
    expiresAt: string;
    isNewUser: boolean;
  } | null>(null);

  // Form state for creating user
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFirstName, setNewUserFirstName] = useState('');
  const [newUserLastName, setNewUserLastName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('employee');

  // Fetch users and properties in parallel for better performance
  const [usersQuery, propertiesQuery] = useQueries({
    queries: [
      {
        queryKey: ['admin-users'],
        queryFn: async () => {
          const supabase = getClient();
          const { data, error } = await (supabase as any)
            .from('profiles')
            .select(`
              *,
              organizations:organization_id(name),
              property_assignments (
                property_id,
                property:properties (*)
              ),
              auth_credentials (
                id,
                user_id,
                username,
                must_change_password,
                locked_until,
                failed_attempts
              )
            `)
            .order('first_name');

          if (error) throw error;
          return data as UserWithAssignments[];
        },
      },
      {
        queryKey: ['all-properties'],
        queryFn: async () => {
          const supabase = getClient();
          const { data, error } = await (supabase as any)
            .from('properties')
            .select('*')
            .order('name');

          if (error) throw error;
          return data as Property[];
        },
      },
    ],
  });

  const users = usersQuery.data ?? [];
  const allProperties = propertiesQuery.data ?? [];
  const isLoading = usersQuery.isLoading || propertiesQuery.isLoading;

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: UserRole }) => {
      const supabase = getClient();
      const { error } = await (supabase as any)
        .from('profiles')
        .update({ role })
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tUsers('roleUpdated'));
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowRoleDialog(false);
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });

  // Toggle property assignment mutation
  const toggleAssignmentMutation = useMutation({
    mutationFn: async ({ userId, propertyId, assign }: { userId: string; propertyId: string; assign: boolean }) => {
      const supabase = getClient();
      if (assign) {
        const { error } = await (supabase as any)
          .from('property_assignments')
          .upsert({ user_id: userId, property_id: propertyId, organization_id: organizationId }, { onConflict: 'user_id,property_id', ignoreDuplicates: true });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('property_assignments')
          .delete()
          .eq('user_id', userId)
          .eq('property_id', propertyId);
        if (error) throw error;
      }
      return { userId, propertyId, assign };
    },
    onMutate: async ({ userId, propertyId, assign }) => {
      // Optimistic update - immediately update selectedUser state
      if (selectedUser && selectedUser.id === userId) {
        const property = allProperties.find(p => p.id === propertyId);
        if (assign && property) {
          setSelectedUser({
            ...selectedUser,
            property_assignments: [
              ...selectedUser.property_assignments,
              { property_id: propertyId, property }
            ]
          });
        } else {
          setSelectedUser({
            ...selectedUser,
            property_assignments: selectedUser.property_assignments.filter(
              a => a.property_id !== propertyId
            )
          });
        }
      }
    },
    onSuccess: () => {
      toast.success(tUsers('assignmentUpdated'));
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (error: Error, { userId, propertyId, assign }) => {
      toast.error(`${t('common.error')}: ${error.message}`);
      // Revert optimistic update on error
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  // Assign/unassign all properties mutation
  const toggleAllPropertiesMutation = useMutation({
    mutationFn: async ({ userId, assign }: { userId: string; assign: boolean }) => {
      const supabase = getClient();
      if (assign) {
        // Get currently assigned property IDs
        const currentAssignments = selectedUser?.property_assignments.map(a => a.property_id) || [];
        // Filter to only unassigned properties
        const unassignedProperties = allProperties.filter(p => !currentAssignments.includes(p.id));

        if (unassignedProperties.length > 0) {
          const { error } = await (supabase as any)
            .from('property_assignments')
            .upsert(
              unassignedProperties.map(p => ({ user_id: userId, property_id: p.id, organization_id: organizationId })),
              { onConflict: 'user_id,property_id', ignoreDuplicates: true }
            );
          if (error) throw error;
        }
      } else {
        // Remove all assignments for this user
        const { error } = await (supabase as any)
          .from('property_assignments')
          .delete()
          .eq('user_id', userId);
        if (error) throw error;
      }
      return { userId, assign };
    },
    onSuccess: (_, { assign }) => {
      toast.success(assign ? tUsers('allPropertiesAssigned') : tUsers('allAssignmentsRemoved'));
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      // Update selectedUser state
      if (selectedUser) {
        if (assign) {
          setSelectedUser({
            ...selectedUser,
            property_assignments: allProperties.map(p => ({ property_id: p.id, property: p }))
          });
        } else {
          setSelectedUser({
            ...selectedUser,
            property_assignments: []
          });
        }
      }
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async ({ username, email, firstName, lastName, role }: {
      username?: string;
      email?: string;
      firstName: string;
      lastName: string;
      role: UserRole;
    }) => {
      const response = await fetch('/api/auth/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, firstName, lastName, role }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || tUsers('createUserError'));
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowCreateDialog(false);
      setNewUserUsername('');
      setNewUserEmail('');
      setNewUserFirstName('');
      setNewUserLastName('');
      setNewUserRole('employee');

      // Show temp password dialog
      setTempPasswordData({
        username: data.user.username,
        tempPassword: data.tempPassword,
        expiresAt: data.tempPasswordExpiresAt,
        isNewUser: true,
      });
      setShowTempPasswordDialog(true);
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch('/api/auth/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || tUsers('resetPasswordError'));
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowResetPasswordDialog(false);

      // Show temp password dialog
      setTempPasswordData({
        username: data.user.username,
        tempPassword: data.tempPassword,
        expiresAt: data.tempPasswordExpiresAt,
        isNewUser: false,
      });
      setShowTempPasswordDialog(true);
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });

  // Unlock account mutation
  const unlockAccountMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch('/api/auth/admin/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || tUsers('unlockError'));
      }
      return data;
    },
    onSuccess: () => {
      toast.success(tUsers('accountUnlocked'));
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });

  // Update vacation days mutation
  const updateVacationDaysMutation = useMutation({
    mutationFn: async ({ userId, days }: { userId: string; days: number }) => {
      const supabase = getClient();
      const { error } = await (supabase as any)
        .from('profiles')
        .update({ vacation_days_per_year: days })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tUsers('vacationDaysUpdated'));
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowVacationDaysDialog(false);
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });

  // Toggle user active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const supabase = getClient();
      const { error } = await (supabase as any)
        .from('profiles')
        .update({ is_active: isActive })
        .eq('id', userId);

      if (error) throw error;
      return { userId, isActive };
    },
    onSuccess: (_, { isActive }) => {
      toast.success(isActive ? tUsers('userActivated') : tUsers('userDeactivated'));
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowDeactivateDialog(false);
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });

  // Redirect if no permission
  useEffect(() => {
    if (!permissions.canManageEmployees) {
      router.push('/admin');
    }
  }, [permissions.canManageEmployees, router]);

  // Filter users by search and active status
  const filteredUsers = users.filter((user) => {
    // Filter by active status
    if (!showInactiveUsers && !user.is_active) return false;

    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    const username = user.auth_credentials?.[0]?.username || '';
    return (
      user.email.toLowerCase().includes(search) ||
      user.first_name?.toLowerCase().includes(search) ||
      user.last_name?.toLowerCase().includes(search) ||
      username.toLowerCase().includes(search)
    );
  });

  const assignableRoles = permissions.role ? getAssignableRoles(permissions.role) : [];

  const getUserAssignedPropertyIds = (user: UserWithAssignments) =>
    user.property_assignments?.map((a) => a.property_id) || [];

  const isUserLocked = (user: UserWithAssignments) => {
    const creds = user.auth_credentials?.[0];
    return creds?.locked_until && new Date(creds.locked_until) > new Date();
  };

  const mustChangePassword = (user: UserWithAssignments) => {
    return user.auth_credentials?.[0]?.must_change_password || false;
  };

  const isUserInactive = (user: UserWithAssignments) => {
    return !user.is_active;
  };

  if (!permissions.canManageEmployees) {
    return null;
  }

  const handleCreateUser = () => {
    if (!newUserFirstName.trim() || !newUserLastName.trim()) {
      toast.error(tUsers('nameRequired'));
      return;
    }
    createUserMutation.mutate({
      username: newUserUsername.trim() || undefined,
      email: newUserEmail.trim() || undefined,
      firstName: newUserFirstName.trim(),
      lastName: newUserLastName.trim(),
      role: newUserRole,
    });
  };

  return (
    <PageContainer
      header={
        <Header
          title={tUsers('title')}
          rightElement={
            <Button
              size="sm"
              onClick={() => setShowCreateDialog(true)}
              className="gap-1"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">{tUsers('create')}</span>
            </Button>
          }
        />
      }
    >
      {/* Search and Filters */}
      <div className="space-y-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={tUsers('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label={tUsers('searchPlaceholder')}
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showInactiveUsers}
            onChange={(e) => setShowInactiveUsers(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-muted-foreground">{tUsers('showInactive')}</span>
        </label>
      </div>

      {/* Users list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          {t('common.loading')}
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{tUsers('noUsers')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((user) => {
            const initials = getInitials(user.first_name, user.last_name);
            const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || tUsers('noName');
            const assignedCount = user.property_assignments?.length || 0;
            const username = user.auth_credentials?.[0]?.username;
            const locked = isUserLocked(user);
            const needsPasswordChange = mustChangePassword(user);
            const inactive = isUserInactive(user);

            return (
              <Card key={user.id} interactive className="cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Avatar - hidden on mobile */}
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={fullName}
                        className="hidden sm:block w-10 h-10 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="hidden sm:flex w-10 h-10 rounded-full bg-primary-100 items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-primary-700">
                          {initials}
                        </span>
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium truncate">{fullName}</h3>
                        {isSuperAdmin && user.organizations?.name && (
                          <span className="hidden sm:inline-flex badge bg-purple-100 text-purple-700 text-xs">
                            {user.organizations.name}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {username ? `@${username}` : user.email}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="badge badge-info text-xs">
                          {roleLabels[user.role]}
                        </span>
                        {inactive && (
                          <span className="badge bg-gray-100 text-gray-700 text-xs">
                            {tUsers('inactive')}
                          </span>
                        )}
                        {locked && (
                          <span className="badge bg-red-100 text-red-700 text-xs">
                            {tUsers('locked')}
                          </span>
                        )}
                        {needsPasswordChange && !locked && !inactive && (
                          <span className="badge bg-amber-100 text-amber-700 text-xs">
                            {tUsers('changePassword')}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {assignedCount} {assignedCount === 1 ? tUsers('property') : tUsers('properties')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {user.vacation_days_per_year ?? 25} {tUsers('vacationDays')}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-row gap-1 flex-shrink-0">
                      {user.id !== profile?.id && permissions.role && canEditUser(permissions.role, user.role) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (inactive) {
                              toggleActiveMutation.mutate({ userId: user.id, isActive: true });
                            } else {
                              setSelectedUser(user);
                              setShowDeactivateDialog(true);
                            }
                          }}
                          aria-label={inactive ? tUsers('activateUser') : tUsers('deactivateUser')}
                          disabled={toggleActiveMutation.isPending}
                        >
                          <Power className={cn('h-4 w-4', inactive ? 'text-green-500' : 'text-gray-400')} />
                        </Button>
                      )}
                      {locked && permissions.role && canEditUser(permissions.role, user.role) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            unlockAccountMutation.mutate(user.id);
                          }}
                          aria-label={tUsers('unlockAccount')}
                          disabled={unlockAccountMutation.isPending}
                        >
                          <Unlock className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                      {user.id !== profile?.id && username && permissions.role && canEditUser(permissions.role, user.role) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUser(user);
                            setShowResetPasswordDialog(true);
                          }}
                          aria-label={tUsers('resetPassword')}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                      )}
                      {user.id !== profile?.id && permissions.role && canEditUser(permissions.role, user.role) && assignableRoles.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUser(user);
                            setShowRoleDialog(true);
                          }}
                          aria-label={tUsers('changeRole')}
                        >
                          <Shield className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedUser(user);
                          setVacationDaysValue(user.vacation_days_per_year ?? 25);
                          setShowVacationDaysDialog(true);
                        }}
                        aria-label={tUsers('editVacationDays')}
                      >
                        <Palmtree className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedUser(user);
                          setShowAssignmentsSheet(true);
                        }}
                        aria-label={tUsers('assignProperties')}
                      >
                        <Building2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {isSuperAdmin && user.organizations?.name && (
                    <span className="sm:hidden block w-full rounded-full px-2.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 mt-2">
                      {user.organizations.name}
                    </span>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Role change dialog */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tUsers('changeRole')}</DialogTitle>
            <DialogDescription>
              {tUsers('selectNewRole', { name: `${selectedUser?.first_name} ${selectedUser?.last_name}` })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            {assignableRoles.map((role) => (
              <button
                key={role}
                onClick={() =>
                  selectedUser &&
                  updateRoleMutation.mutate({ userId: selectedUser.id, role })
                }
                className={cn(
                  'w-full p-3 text-left rounded-lg border transition-colors',
                  selectedUser?.role === role
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-muted hover:border-primary-300'
                )}
              >
                <span className="font-medium">{roleLabels[role]}</span>
              </button>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRoleDialog(false)}>
              {t('common.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Property assignments sheet */}
      <Sheet open={showAssignmentsSheet} onOpenChange={setShowAssignmentsSheet}>
        <SheetContent side="bottom" className="h-[70vh]">
          <SheetHeader>
            <SheetTitle>
              {tUsers('propertiesFor', { name: `${selectedUser?.first_name} ${selectedUser?.last_name}` })}
            </SheetTitle>
          </SheetHeader>

          {/* Bulk action buttons */}
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectedUser && toggleAllPropertiesMutation.mutate({ userId: selectedUser.id, assign: true })}
              disabled={toggleAllPropertiesMutation.isPending || !selectedUser || selectedUser.property_assignments.length === allProperties.length}
            >
              {tUsers('assignAll')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectedUser && toggleAllPropertiesMutation.mutate({ userId: selectedUser.id, assign: false })}
              disabled={toggleAllPropertiesMutation.isPending || !selectedUser || selectedUser.property_assignments.length === 0}
            >
              {tUsers('removeAll')}
            </Button>
          </div>

          <div className="mt-4 space-y-2 overflow-y-auto max-h-[calc(70vh-160px)]">
            {allProperties.map((property) => {
              const isAssigned = selectedUser
                ? getUserAssignedPropertyIds(selectedUser).includes(property.id)
                : false;

              return (
                <button
                  key={property.id}
                  onClick={() =>
                    selectedUser &&
                    toggleAssignmentMutation.mutate({
                      userId: selectedUser.id,
                      propertyId: property.id,
                      assign: !isAssigned,
                    })
                  }
                  className={cn(
                    'w-full p-3 text-left rounded-lg border transition-colors flex items-center justify-between',
                    isAssigned
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-muted hover:border-primary-300'
                  )}
                  disabled={toggleAssignmentMutation.isPending}
                >
                  <div>
                    <p className="font-medium">{property.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {property.address}, {property.city}
                    </p>
                  </div>
                  <div
                    className={cn(
                      'w-5 h-5 rounded border-2 flex items-center justify-center',
                      isAssigned
                        ? 'bg-primary-600 border-primary-600'
                        : 'border-muted-foreground'
                    )}
                  >
                    {isAssigned && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* Create user dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tUsers('createUser')}</DialogTitle>
            <DialogDescription>
              {tUsers('createUserDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Input
              label={tUsers('usernameOptional')}
              type="text"
              placeholder={tUsers('usernameGenerated')}
              value={newUserUsername}
              onChange={(e) => setNewUserUsername(e.target.value.toLowerCase())}
              autoCapitalize="none"
              autoCorrect="off"
            />

            <Input
              label={tUsers('emailOptional')}
              type="email"
              placeholder="benutzer@beispiel.de"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label={tUsers('firstName')}
                placeholder="Max"
                value={newUserFirstName}
                onChange={(e) => setNewUserFirstName(e.target.value)}
              />
              <Input
                label={tUsers('lastName')}
                placeholder="Mustermann"
                value={newUserLastName}
                onChange={(e) => setNewUserLastName(e.target.value)}
              />
            </div>

            <div className="w-full">
              <label className="mb-2 block text-sm font-medium text-foreground">
                {tUsers('role')}
              </label>
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                className={cn(
                  'flex h-12 w-full rounded-lg border border-input bg-background px-4 py-3 text-base',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                )}
              >
                {assignableRoles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700 space-y-1">
                <p>{tUsers('tempPasswordNote')}</p>
                <p>{tUsers('usernameNote')}</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateUser} disabled={createUserMutation.isPending}>
              {createUserMutation.isPending ? tUsers('creating') : tUsers('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password confirmation dialog */}
      {selectedUser && (
        <ResetPasswordDialog
          open={showResetPasswordDialog}
          onOpenChange={setShowResetPasswordDialog}
          userName={`${selectedUser.first_name} ${selectedUser.last_name}`}
          onConfirm={async () => {
            await resetPasswordMutation.mutateAsync(selectedUser.id);
          }}
        />
      )}

      {/* Temp password display dialog */}
      {tempPasswordData && (
        <TempPasswordDialog
          open={showTempPasswordDialog}
          onOpenChange={(open) => {
            setShowTempPasswordDialog(open);
            if (!open) setTempPasswordData(null);
          }}
          username={tempPasswordData.username}
          tempPassword={tempPasswordData.tempPassword}
          expiresAt={tempPasswordData.expiresAt}
          isNewUser={tempPasswordData.isNewUser}
        />
      )}

      {/* Deactivate user confirmation dialog */}
      <Dialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tUsers('deactivateUser')}</DialogTitle>
            <DialogDescription>
              {tUsers('confirmDeactivate', { name: `${selectedUser?.first_name} ${selectedUser?.last_name}` })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeactivateDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedUser && toggleActiveMutation.mutate({ userId: selectedUser.id, isActive: false })}
              disabled={toggleActiveMutation.isPending}
            >
              {toggleActiveMutation.isPending ? tUsers('deactivating') : tUsers('deactivate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Vacation days dialog */}
      <Dialog open={showVacationDaysDialog} onOpenChange={setShowVacationDaysDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tUsers('vacationDaysPerYear')}</DialogTitle>
            <DialogDescription>
              {tUsers('setVacationDays', { name: `${selectedUser?.first_name} ${selectedUser?.last_name}` })}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              label={tUsers('vacationDaysPerYear')}
              type="number"
              min={0}
              max={60}
              step={0.5}
              value={vacationDaysValue}
              onChange={(e) => setVacationDaysValue(parseFloat(e.target.value) || 0)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVacationDaysDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => selectedUser && updateVacationDaysMutation.mutate({ userId: selectedUser.id, days: vacationDaysValue })}
              disabled={updateVacationDaysMutation.isPending}
            >
              {updateVacationDaysMutation.isPending ? tUsers('saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
