'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Mail, Shield, Building2, ChevronRight, Search } from 'lucide-react';
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
import { useAuthStore } from '@/stores/auth-store';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';
import { roleLabels, getAssignableRoles } from '@/lib/permissions';
import { getInitials, cn } from '@/lib/utils';
import type { Profile, Property, UserRole } from '@/types/database';

interface UserWithAssignments extends Profile {
  property_assignments: { property_id: string; property: Property }[];
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

  // Fetch all users
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          property_assignments (
            property_id,
            property:properties (*)
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
      const { data, error } = await supabase
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
      const { error } = await supabase
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
        const { error } = await supabase
          .from('property_assignments')
          .insert({ user_id: userId, property_id: propertyId });
        if (error) throw error;
      } else {
        const { error } = await supabase
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
    return (
      user.email.toLowerCase().includes(search) ||
      user.first_name?.toLowerCase().includes(search) ||
      user.last_name?.toLowerCase().includes(search)
    );
  });

  const assignableRoles = permissions.role ? getAssignableRoles(permissions.role) : [];

  const getUserAssignedPropertyIds = (user: UserWithAssignments) =>
    user.property_assignments?.map((a) => a.property_id) || [];

  if (!permissions.canManageEmployees) {
    return null;
  }

  return (
    <PageContainer
      header={<Header title="Benutzerverwaltung" showBack />}
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
                      <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="badge badge-info text-xs">
                          {roleLabels[user.role]}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {assignedCount} {assignedCount === 1 ? 'Liegenschaft' : 'Liegenschaften'}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 flex-shrink-0">
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
    </PageContainer>
  );
}
