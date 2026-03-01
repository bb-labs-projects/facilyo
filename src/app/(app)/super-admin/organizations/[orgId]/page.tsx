'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Users, Trash2 } from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function OrganizationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const orgId = params.orgId as string;

  const { data: org, isLoading } = useQuery({
    queryKey: ['super-admin-org', orgId],
    queryFn: async () => {
      const res = await fetch(`/api/super-admin/organizations?id=${orgId}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const toggleActive = useMutation({
    mutationFn: async (is_active: boolean) => {
      const res = await fetch('/api/super-admin/organizations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orgId, is_active }),
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-org', orgId] });
      toast.success('Status aktualisiert');
    },
  });

  const deleteOrg = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/super-admin/organizations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orgId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Organisation gelöscht');
      router.push('/super-admin/organizations');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <PageContainer header={<Header title="Organisation" showBack backHref="/super-admin/organizations" />}>
        <p className="text-muted-foreground">Laden...</p>
      </PageContainer>
    );
  }

  if (!org) {
    return (
      <PageContainer header={<Header title="Organisation" showBack backHref="/super-admin/organizations" />}>
        <p>Nicht gefunden</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer header={<Header title={org.organization?.name || 'Organisation'} showBack backHref="/super-admin/organizations" />}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium">{org.organization?.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Slug</p>
              <p className="font-medium">{org.organization?.slug}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Kontakt-Email</p>
              <p className="font-medium">{org.organization?.contact_email || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <span className={`text-xs px-2 py-1 rounded-full ${org.organization?.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {org.organization?.is_active ? 'Aktiv' : 'Inaktiv'}
              </span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Erstellt</p>
              <p className="font-medium">{org.organization?.created_at ? new Date(org.organization.created_at).toLocaleDateString('de-CH') : '-'}</p>
            </div>
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <Button
              variant={org.organization?.is_active ? 'destructive' : 'primary'}
              onClick={() => toggleActive.mutate(!org.organization?.is_active)}
            >
              {org.organization?.is_active ? 'Deaktivieren' : 'Aktivieren'}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm('Organisation wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
                  deleteOrg.mutate();
                }
              }}
              leftIcon={<Trash2 className="h-4 w-4" />}
            >
              Löschen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Mitglieder ({org.members?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {org.members && org.members.length > 0 ? (
            <div className="space-y-2">
              {org.members.map((member: any) => (
                <div key={member.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-medium">{member.first_name} {member.last_name}</p>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-muted">{member.role}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">Keine Mitglieder</p>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
