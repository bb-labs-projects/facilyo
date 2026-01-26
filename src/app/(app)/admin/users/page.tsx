'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Shield, Building2, Search, UserPlus, KeyRound, Unlock, AlertCircle } from 'lucide-react';
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
import { roleLabels, getAssignableRoles } from '@/lib/permissions';
import { getInitials, cn } from '@/lib/utils';
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
  property_assignments: { property_id: string; property: Property }[];
  auth_credentials?: AuthCredentials[];
}

export default function AdminUsersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const permissions = usePermissions();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserWithAssignments | null>(null);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showAssignmentsSheet, setShowAssignmentsSheet] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);
  const [showTempPasswordDialog, setShowTempPasswordDialog] = useState(false);
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

  // Fetch all users with their auth credentials
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select(`
          *,
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
  });

  // Fetch all properties
  const { data: allProperties = [] } = useQuery({
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
  });

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
      toast.success('Rolle wurde aktualisiert');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowRoleDialog(false);
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // Toggle property assignment mutation
  const toggleAssignmentMutation = useMutation({
    mutationFn: async ({ userId, propertyId, assign }: { userId: string; propertyId: string; assign: boolean }) => {
      const supabase = getClient();
      if (assign) {
        const { error } = await (supabase as any)
          .from('property_assignments')
          .insert({ user_id: userId, property_id: propertyId });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('property_assignments')
          .delete()
          .eq('user_id', userId)
          .eq('property_id', propertyId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Zuweisung wurde aktualisiert');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async ({ username, email, firstName, lastName, role }: {
      username?: string;
      email: string;
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
        throw new Error(data.error || 'Fehler beim Erstellen des Benutzers');
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
      toast.error(`Fehler: ${error.message}`);
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
        throw new Error(data.error || 'Fehler beim Zurücksetzen des Passworts');
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
      toast.error(`Fehler: ${error.message}`);
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
        throw new Error(data.error || 'Fehler beim Entsperren des Accounts');
      }
      return data;
    },
    onSuccess: () => {
      toast.success('Account wurde entsperrt');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // Redirect if no permission
  useEffect(() => {
    if (!permissions.canManageEmployees) {
      router.push('/admin');
    }
  }, [permissions.canManageEmployees, router]);

  // Filter users by search
  const filteredUsers = users.filter((user) => {
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

  if (!permissions.canManageEmployees) {
    return null;
  }

  const handleCreateUser = () => {
    if (!newUserEmail.trim()) {
      toast.error('E-Mail ist erforderlich');
      return;
    }
    if (!newUserFirstName.trim() || !newUserLastName.trim()) {
      toast.error('Vor- und Nachname sind erforderlich');
      return;
    }
    createUserMutation.mutate({
      username: newUserUsername.trim() || undefined,
      email: newUserEmail.trim(),
      firstName: newUserFirstName.trim(),
      lastName: newUserLastName.trim(),
      role: newUserRole,
    });
  };

  return (
    <PageContainer
      header={
        <Header
          title="Benutzerverwaltung"
          showBack
          rightElement={
            <Button
              size="sm"
              onClick={() => setShowCreateDialog(true)}
              className="gap-1"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Erstellen</span>
            </Button>
          }
        />
      }
    >
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Benutzer suchen..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Users list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Wird geladen...
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Keine Benutzer gefunden</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((user) => {
            const initials = getInitials(user.first_name, user.last_name);
            const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Kein Name';
            const assignedCount = user.property_assignments?.length || 0;
            const username = user.auth_credentials?.[0]?.username;
            const locked = isUserLocked(user);
            const needsPasswordChange = mustChangePassword(user);

            return (
              <Card key={user.id} interactive className="cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={fullName}
                        className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-primary-700">
                          {initials}
                        </span>
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{fullName}</h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {username ? `@${username}` : user.email}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="badge badge-info text-xs">
                          {roleLabels[user.role]}
                        </span>
                        {locked && (
                          <span className="badge bg-red-100 text-red-700 text-xs">
                            Gesperrt
                          </span>
                        )}
                        {needsPasswordChange && !locked && (
                          <span className="badge bg-amber-100 text-amber-700 text-xs">
                            Passwort ändern
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {assignedCount} {assignedCount === 1 ? 'Liegenschaft' : 'Liegenschaften'}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 flex-shrink-0">
                      {/* Unlock button */}
                      {locked && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            unlockAccountMutation.mutate(user.id);
                          }}
                          title="Account entsperren"
                          disabled={unlockAccountMutation.isPending}
                        >
                          <Unlock className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                      {/* Reset password button */}
                      {user.id !== profile?.id && username && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUser(user);
                            setShowResetPasswordDialog(true);
                          }}
                          title="Passwort zurücksetzen"
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Only show role change if can assign */}
                      {user.id !== profile?.id && assignableRoles.includes(user.role) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUser(user);
                            setShowRoleDialog(true);
                          }}
                          title="Rolle ändern"
                        >
                          <Shield className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedUser(user);
                          setShowAssignmentsSheet(true);
                        }}
                        title="Liegenschaften zuweisen"
                      >
                        <Building2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
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
            <DialogTitle>Rolle ändern</DialogTitle>
            <DialogDescription>
              Wählen Sie eine neue Rolle für {selectedUser?.first_name} {selectedUser?.last_name}
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
              Abbrechen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Property assignments sheet */}
      <Sheet open={showAssignmentsSheet} onOpenChange={setShowAssignmentsSheet}>
        <SheetContent side="bottom" className="h-[70vh]">
          <SheetHeader>
            <SheetTitle>
              Liegenschaften für {selectedUser?.first_name} {selectedUser?.last_name}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-2 overflow-y-auto max-h-[calc(70vh-100px)]">
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
            <DialogTitle>Benutzer erstellen</DialogTitle>
            <DialogDescription>
              Erstellen Sie einen neuen Benutzer mit temporärem Passwort.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Input
              label="Benutzername (optional)"
              type="text"
              placeholder="Wird aus E-Mail generiert wenn leer"
              value={newUserUsername}
              onChange={(e) => setNewUserUsername(e.target.value.toLowerCase())}
              autoCapitalize="none"
              autoCorrect="off"
            />

            <Input
              label="E-Mail *"
              type="email"
              placeholder="benutzer@beispiel.de"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Vorname *"
                placeholder="Max"
                value={newUserFirstName}
                onChange={(e) => setNewUserFirstName(e.target.value)}
              />
              <Input
                label="Nachname *"
                placeholder="Mustermann"
                value={newUserLastName}
                onChange={(e) => setNewUserLastName(e.target.value)}
              />
            </div>

            <div className="w-full">
              <label className="mb-2 block text-sm font-medium text-foreground">
                Rolle
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
              <p className="text-sm text-blue-700">
                Ein temporäres Passwort wird generiert und muss beim ersten Login geändert werden.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleCreateUser} disabled={createUserMutation.isPending}>
              {createUserMutation.isPending ? 'Wird erstellt...' : 'Erstellen'}
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
    </PageContainer>
  );
}
