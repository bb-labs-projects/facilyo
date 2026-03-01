'use client';

import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
import { usePathname } from 'next/navigation';
import {
  Home,
  Clock,
  ClipboardList,
  AlertTriangle,
  Activity,
  User,
  Users,
  Building2,
  Briefcase,
  Shield,
  CalendarDays,
  Palmtree,
  Crown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { useOpenIssuesCount } from '@/hooks/use-open-issues-count';
import { useVacationNotificationCount } from '@/hooks/use-vacation-notification-count';
import { useNewTasksNotificationCount } from '@/hooks/use-new-tasks-notification-count';
import { useCompletedTasksNotificationCount } from '@/hooks/use-completed-tasks-notification-count';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requireAdmin?: boolean;
  requireOwner?: boolean;
  requireRolePermissions?: boolean;
  requireUserCalendar?: boolean;
}

const mainNavItems: NavItem[] = [
  { href: '/', label: 'Start', icon: Home },
  { href: '/time', label: 'Zeiten', icon: Clock },
  { href: '/tasks', label: 'Aufgaben', icon: ClipboardList },
  { href: '/issues', label: 'Meldungen', icon: AlertTriangle },
  { href: '/vacation', label: 'Ferien', icon: Palmtree },
];

const adminNavItems: NavItem[] = [
  { href: '/admin/users', label: 'Benutzer', icon: Users, requireAdmin: true, requireOwner: true },
  { href: '/admin/properties', label: 'Liegenschaften', icon: Building2, requireAdmin: true },
  { href: '/admin/clients', label: 'Kunden', icon: Briefcase, requireAdmin: true },
  { href: '/admin/checklists', label: 'Checklisten', icon: ClipboardList, requireAdmin: true },
  { href: '/admin/activity', label: 'Aktivitäten', icon: Activity, requireAdmin: true },
  { href: '/admin/time-overview', label: 'Zeitübersicht', icon: Clock, requireAdmin: true },
  { href: '/admin/calendar', label: 'Benutzerkalender', icon: CalendarDays, requireAdmin: true, requireUserCalendar: true },
  { href: '/admin/roles', label: 'Rollen', icon: Shield, requireAdmin: true, requireRolePermissions: true },
];

interface MobileMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileMenu({ open, onOpenChange }: MobileMenuProps) {
  const pathname = usePathname();
  const permissions = usePermissions();
  const { user, profile } = useAuthStore();
  const openIssuesCount = useOpenIssuesCount();
  const { count: vacationCount } = useVacationNotificationCount();
  const { count: newTasksCount } = useNewTasksNotificationCount();
  const { count: completedTasksCount } = useCompletedTasksNotificationCount();

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  const filteredAdminItems = adminNavItems.filter((item) => {
    // First check if user has admin access at all
    if (item.requireAdmin && !permissions.canAccessAdminPanel) {
      return false;
    }
    // Check specific permission requirements
    if (item.requireOwner && !permissions.canManageEmployees) {
      return false;
    }
    if (item.requireRolePermissions && !permissions.canManageRolePermissions) {
      return false;
    }
    if (item.requireUserCalendar && !permissions.canManageUserCalendar) {
      return false;
    }
    return true;
  });

  const handleNavClick = () => {
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] bg-primary-900 p-0 text-slate-100 border-primary-800 flex flex-col">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        {/* Logo/Branding */}
        <div className="flex h-[60px] items-center border-b border-primary-800 px-6">
          <Logo variant="light" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {/* Main Navigation */}
          <div className="space-y-1">
            {mainNavItems.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary-700 text-white'
                      : 'text-slate-300 hover:bg-primary-800 hover:text-white'
                  )}
                >
                  <span className="relative flex-shrink-0">
                    <Icon className="h-5 w-5" />
                    {item.href === '/tasks' && newTasksCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center" aria-hidden="true">
                        {newTasksCount}
                      </span>
                    )}
                    {item.href === '/issues' && openIssuesCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center" aria-hidden="true">
                        {openIssuesCount}
                      </span>
                    )}
                    {item.href === '/vacation' && vacationCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center" aria-hidden="true">
                        {vacationCount}
                      </span>
                    )}
                  </span>
                  <span>{item.label}</span>
                  {item.href === '/tasks' && newTasksCount > 0 && (
                    <span className="sr-only">, {newTasksCount} neue</span>
                  )}
                  {item.href === '/issues' && openIssuesCount > 0 && (
                    <span className="sr-only">, {openIssuesCount} offen</span>
                  )}
                  {item.href === '/vacation' && vacationCount > 0 && (
                    <span className="sr-only">, {vacationCount} offen</span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Admin Navigation */}
          {filteredAdminItems.length > 0 && (
            <>
              <div className="my-4 border-t border-primary-800" />
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Administration
              </p>
              <div className="space-y-1">
                {filteredAdminItems.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={handleNavClick}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        active
                          ? 'bg-primary-700 text-white'
                          : 'text-slate-300 hover:bg-primary-800 hover:text-white'
                      )}
                    >
                      <span className="relative flex-shrink-0">
                        <Icon className="h-5 w-5" />
                        {item.href === '/admin/activity' && completedTasksCount > 0 && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center" aria-hidden="true">
                            {completedTasksCount}
                          </span>
                        )}
                      </span>
                      <span>{item.label}</span>
                      {item.href === '/admin/activity' && completedTasksCount > 0 && (
                        <span className="sr-only">, {completedTasksCount} erledigt</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
          {/* Super-Admin Navigation */}
          {permissions.isSuperAdmin && (
            <>
              <div className="my-4 border-t border-primary-800" />
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Super-Admin
              </p>
              <div className="space-y-1">
                <Link
                  href="/super-admin"
                  onClick={handleNavClick}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive('/super-admin')
                      ? 'bg-primary-700 text-white'
                      : 'text-slate-300 hover:bg-primary-800 hover:text-white'
                  )}
                >
                  <Crown className="h-5 w-5" />
                  <span>Super-Admin</span>
                </Link>
              </div>
            </>
          )}
        </nav>

        {/* User Profile Section */}
        <div className="border-t border-primary-800 p-4">
          <Link
            href="/profile"
            onClick={handleNavClick}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
              isActive('/profile')
                ? 'bg-primary-700 text-white'
                : 'text-slate-300 hover:bg-primary-800 hover:text-white'
            )}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-700">
              <User className="h-5 w-5" />
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium">
                {profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Benutzer' : 'Benutzer'}
              </span>
              <span className="truncate text-xs text-slate-400">
                {user?.email || ''}
              </span>
            </div>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
