'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function GlobalUsersPage() {
  const [search, setSearch] = useState('');

  const { data: users, isLoading } = useQuery({
    queryKey: ['super-admin-users', search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch(`/api/super-admin/users?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: search.length === 0 || search.length >= 2,
  });

  return (
    <PageContainer header={<Header title="Alle Benutzer" showBack />}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Benutzer suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Laden...</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Benutzer ({users?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {users && users.length > 0 ? (
              <div className="space-y-2">
                {users.map((user: any) => (
                  <div key={user.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium">{user.first_name} {user.last_name}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs px-2 py-1 rounded-full bg-muted">{user.role}</span>
                      <p className="text-xs text-muted-foreground mt-1">{user.organization_name || 'Keine Org'}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">Keine Benutzer gefunden</p>
            )}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
