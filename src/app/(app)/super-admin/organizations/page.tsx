'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import Link from 'next/link';

export default function OrganizationsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newOrg, setNewOrg] = useState({ name: '', slug: '', contact_email: '' });

  const { data: organizations, isLoading } = useQuery({
    queryKey: ['super-admin-organizations'],
    queryFn: async () => {
      const res = await fetch('/api/super-admin/organizations');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const res = await fetch('/api/super-admin/organizations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active }),
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      toast.success('Status aktualisiert');
    },
  });

  const createOrg = useMutation({
    mutationFn: async (data: typeof newOrg) => {
      const res = await fetch('/api/super-admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      setShowCreate(false);
      setNewOrg({ name: '', slug: '', contact_email: '' });
      toast.success('Organisation erstellt');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <PageContainer
      header={
        <Header
          title="Organisationen"
          showBack
          rightElement={
            <Button size="sm" onClick={() => setShowCreate(!showCreate)} leftIcon={<Plus className="h-4 w-4" />}>
              Neu
            </Button>
          }
        />
      }
    >

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Neue Organisation</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createOrg.mutate(newOrg);
              }}
              className="space-y-3"
            >
              <Input
                label="Name"
                value={newOrg.name}
                onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
              />
              <Input
                label="Slug"
                value={newOrg.slug}
                onChange={(e) => setNewOrg({ ...newOrg, slug: e.target.value })}
              />
              <Input
                label="Kontakt-Email"
                type="email"
                value={newOrg.contact_email}
                onChange={(e) => setNewOrg({ ...newOrg, contact_email: e.target.value })}
              />
              <Button type="submit" isLoading={createOrg.isPending}>Erstellen</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Laden...</p>
      ) : (
        <div className="space-y-3">
          {organizations?.map((org: any) => (
            <Card key={org.id}>
              <CardContent className="flex items-center justify-between py-4">
                <Link href={`/super-admin/organizations/${org.id}`} className="flex-1">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{org.name}</p>
                      <p className="text-sm text-muted-foreground">{org.slug} &middot; {org.contact_email || 'Keine E-Mail'}</p>
                    </div>
                  </div>
                </Link>
                <button
                  onClick={() => toggleActive.mutate({ id: org.id, is_active: !org.is_active })}
                  className="p-2"
                  title={org.is_active ? 'Deaktivieren' : 'Aktivieren'}
                >
                  {org.is_active ? (
                    <ToggleRight className="h-6 w-6 text-green-600" />
                  ) : (
                    <ToggleLeft className="h-6 w-6 text-red-400" />
                  )}
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
