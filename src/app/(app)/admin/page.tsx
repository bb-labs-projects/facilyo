'use client';

import { useRouter } from 'next/navigation';
import { Users, Building2, ClipboardList, ChevronRight, Settings, Activity, Shield } from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { usePermissions } from '@/hooks/use-permissions';

interface AdminMenuItem {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  requireOwner?: boolean;
  requireRolePermissions?: boolean;
}

const adminMenuItems: AdminMenuItem[] = [
  {
    href: '/admin/users',
    label: 'Benutzerverwaltung',
    description: 'Mitarbeiter hinzufügen, Rollen zuweisen',
    icon: Users,
    requireOwner: true,
  },
  {
    href: '/admin/properties',
    label: 'Liegenschaften',
    description: 'Liegenschaften verwalten und zuweisen',
    icon: Building2,
  },
  {
    href: '/admin/checklists',
    label: 'Checklisten-Vorlagen',
    description: 'Checklisten für Liegenschaften erstellen',
    icon: ClipboardList,
  },
  {
    href: '/admin/activity',
    label: 'Aktivitäten',
    description: 'Erledigte Aufgaben und Checklisten einsehen',
    icon: Activity,
  },
  {
    href: '/admin/roles',
    label: 'Rollen & Berechtigungen',
    description: 'Berechtigungen pro Rolle verwalten',
    icon: Shield,
    requireRolePermissions: true,
  },
];

export default function AdminPage() {
  const router = useRouter();
  const permissions = usePermissions();

  // Redirect if user doesn't have admin access
  if (!permissions.canAccessAdminPanel) {
    router.push('/');
    return null;
  }

  const filteredMenuItems = adminMenuItems.filter((item) => {
    if (item.requireOwner) {
      return permissions.canManageEmployees;
    }
    if (item.requireRolePermissions) {
      return permissions.canManageRolePermissions;
    }
    return true;
  });

  return (
    <PageContainer
      header={<Header title="Verwaltung" showBack />}
    >
      <div className="space-y-3">
        {filteredMenuItems.map((item) => {
          const Icon = item.icon;
          return (
            <Card
              key={item.href}
              interactive
              className="cursor-pointer"
              onClick={() => router.push(item.href)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-6 w-6 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium">{item.label}</h3>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageContainer>
  );
}
