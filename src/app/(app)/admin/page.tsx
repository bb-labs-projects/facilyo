'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Users, Building2, ClipboardList, ChevronRight, Settings, Activity, Shield, Clock, CalendarDays, FileText } from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { usePermissions } from '@/hooks/use-permissions';

interface AdminMenuItem {
  href: string;
  labelKey: string;
  descriptionKey: string;
  icon: React.ComponentType<{ className?: string }>;
  requireOwner?: boolean;
  requireRolePermissions?: boolean;
  requireUserCalendar?: boolean;
  requireInvoices?: boolean;
}

const adminMenuItems: AdminMenuItem[] = [
  {
    href: '/admin/users',
    labelKey: 'users',
    descriptionKey: 'usersDesc',
    icon: Users,
    requireOwner: true,
  },
  {
    href: '/admin/properties',
    labelKey: 'properties',
    descriptionKey: 'propertiesDesc',
    icon: Building2,
  },
  {
    href: '/admin/checklists',
    labelKey: 'checklists',
    descriptionKey: 'checklistsDesc',
    icon: ClipboardList,
  },
  {
    href: '/admin/activity',
    labelKey: 'activity',
    descriptionKey: 'activityDesc',
    icon: Activity,
  },
  {
    href: '/admin/time-overview',
    labelKey: 'timeOverview',
    descriptionKey: 'timeOverviewDesc',
    icon: Clock,
  },
  {
    href: '/admin/calendar',
    labelKey: 'calendar',
    descriptionKey: 'calendarDesc',
    icon: CalendarDays,
    requireUserCalendar: true,
  },
  {
    href: '/admin/roles',
    labelKey: 'roles',
    descriptionKey: 'rolesDesc',
    icon: Shield,
    requireRolePermissions: true,
  },
  {
    href: '/admin/invoices',
    labelKey: 'invoices',
    descriptionKey: 'invoicesDesc',
    icon: FileText,
    requireInvoices: true,
  },
];

export default function AdminPage() {
  const router = useRouter();
  const t = useTranslations('admin');
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
    if (item.requireUserCalendar) {
      return permissions.canManageUserCalendar;
    }
    if (item.requireInvoices) {
      return permissions.canManageInvoices;
    }
    return true;
  });

  return (
    <PageContainer
      header={<Header title={t('title')} />}
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
                    <h3 className="font-medium">{t(item.labelKey)}</h3>
                    <p className="text-sm text-muted-foreground">{t(item.descriptionKey)}</p>
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
