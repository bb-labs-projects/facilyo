'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, Users, Activity } from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function SuperAdminDashboard() {
  const { data: stats } = useQuery({
    queryKey: ['super-admin-stats'],
    queryFn: async () => {
      const res = await fetch('/api/super-admin/organizations?stats=true');
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
  });

  return (
    <PageContainer header={<Header title="Super-Admin" showBack />}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/super-admin/organizations">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Organisationen</CardTitle>
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats?.orgCount ?? '-'}</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/super-admin/users">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Benutzer gesamt</CardTitle>
              <Users className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats?.userCount ?? '-'}</p>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Aktive Organisationen</CardTitle>
            <Activity className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.activeOrgCount ?? '-'}</p>
          </CardContent>
        </Card>
      </div>

      {stats?.recentOrgs && stats.recentOrgs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Neueste Organisationen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.recentOrgs.map((org: any) => (
                <Link
                  key={org.id}
                  href={`/super-admin/organizations/${org.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{org.name}</p>
                    <p className="text-sm text-muted-foreground">{org.slug}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${org.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {org.is_active ? 'Aktiv' : 'Inaktiv'}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
