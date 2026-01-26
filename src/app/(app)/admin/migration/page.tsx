'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, RefreshCw, Download, Check, AlertTriangle, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TempPasswordDialog } from '../users/components/temp-password-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';
import { getInitials, cn } from '@/lib/utils';
import type { Profile } from '@/types/database';

interface MigrationUser extends Profile {
  auth_credentials: {
    id: string;
    username: string;
    must_change_password: boolean;
    temp_password_expires_at: string | null;
  }[] | null;
}

export default function MigrationPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const [showTempPasswordDialog, setShowTempPasswordDialog] = useState(false);
  const [tempPasswordData, setTempPasswordData] = useState<{
    username: string;
    tempPassword: string;
    expiresAt: string;
  } | null>(null);

  // Fetch all users with migration status
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['migration-users'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select(`
          *,
          auth_credentials (
            id,
            username,
            must_change_password,
            temp_password_expires_at
          )
        `)
        .order('first_name');

      if (error) throw error;
      return data as MigrationUser[];
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
      queryClient.invalidateQueries({ queryKey: ['migration-users'] });
      setTempPasswordData({
        username: data.user.username,
        tempPassword: data.tempPassword,
        expiresAt: data.tempPasswordExpiresAt,
      });
      setShowTempPasswordDialog(true);
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

  if (!permissions.canManageEmployees) {
    return null;
  }

  // Calculate statistics
  const totalUsers = users.length;
  const migratedUsers = users.filter((u) => u.auth_credentials && u.auth_credentials.length > 0);
  const notMigratedUsers = users.filter((u) => !u.auth_credentials || u.auth_credentials.length === 0);
  const usersNeedingPasswordChange = migratedUsers.filter(
    (u) => u.auth_credentials?.[0]?.must_change_password
  );
  const usersWithExpiredTempPassword = migratedUsers.filter((u) => {
    const expires = u.auth_credentials?.[0]?.temp_password_expires_at;
    return expires && new Date(expires) < new Date();
  });

  const handleExportCSV = () => {
    const headers = ['Name', 'E-Mail', 'Benutzername', 'Status', 'Passwort ändern'];
    const rows = users.map((user) => {
      const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || '-';
      const username = user.auth_credentials?.[0]?.username || '-';
      const status = user.auth_credentials?.length ? 'Migriert' : 'Nicht migriert';
      const needsChange = user.auth_credentials?.[0]?.must_change_password ? 'Ja' : 'Nein';
      return [name, user.email, username, status, needsChange];
    });

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `migration-status-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportiert');
  };

  return (
    <PageContainer
      header={
        <Header
          title="Benutzermigration"
          showBack
          rightElement={
            <Button size="sm" onClick={handleExportCSV} className="gap-1">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          }
        />
      }
    >
      {/* Statistics */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary-600">{migratedUsers.length}</p>
            <p className="text-sm text-muted-foreground">Migriert</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{notMigratedUsers.length}</p>
            <p className="text-sm text-muted-foreground">Nicht migriert</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{usersNeedingPasswordChange.length}</p>
            <p className="text-sm text-muted-foreground">PW ändern</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{usersWithExpiredTempPassword.length}</p>
            <p className="text-sm text-muted-foreground">Abgelaufen</p>
          </CardContent>
        </Card>
      </div>

      {/* Info banner */}
      {notMigratedUsers.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            {notMigratedUsers.length} Benutzer wurden noch nicht migriert. Führen Sie das
            Migrationsscript aus, um Benutzernamen und temporäre Passwörter zu generieren.
          </p>
        </div>
      )}

      {/* Users list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Wird geladen...</div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => {
            const initials = getInitials(user.first_name, user.last_name);
            const fullName =
              [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Kein Name';
            const isMigrated = user.auth_credentials && user.auth_credentials.length > 0;
            const username = user.auth_credentials?.[0]?.username;
            const needsPasswordChange = user.auth_credentials?.[0]?.must_change_password;
            const tempExpires = user.auth_credentials?.[0]?.temp_password_expires_at;
            const isExpired = tempExpires && new Date(tempExpires) < new Date();

            return (
              <Card key={user.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-primary-700">{initials}</span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{fullName}</h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {isMigrated ? `@${username}` : user.email}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {isMigrated ? (
                          <span className="badge bg-green-100 text-green-700 text-xs flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            Migriert
                          </span>
                        ) : (
                          <span className="badge bg-amber-100 text-amber-700 text-xs">
                            Nicht migriert
                          </span>
                        )}
                        {needsPasswordChange && (
                          <span className="badge bg-blue-100 text-blue-700 text-xs">
                            PW ändern
                          </span>
                        )}
                        {isExpired && (
                          <span className="badge bg-red-100 text-red-700 text-xs">
                            Abgelaufen
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    {isMigrated && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => resetPasswordMutation.mutate(user.id)}
                        disabled={resetPasswordMutation.isPending}
                        title="Neues Passwort generieren"
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Temp password dialog */}
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
          isNewUser={false}
        />
      )}
    </PageContainer>
  );
}
