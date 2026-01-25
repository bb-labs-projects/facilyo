'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Clock,
  ClipboardList,
  AlertTriangle,
  Activity,
  User,
  Settings,
  Users,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuthStore } from '@/stores/auth-store';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requireAdmin?: boolean;
}

const mainNavItems: NavItem[] = [
  { href: '/', label: 'Start', icon: Home },
  { href: '/time', label: 'Zeiten', icon: Clock },
  { href: '/tasks', label: 'Aufgaben', icon: ClipboardList },
  { href: '/issues', label: 'Meldungen', icon: AlertTriangle },
];

const adminNavItems: NavItem[] = [
  { href: '/admin/activity', label: 'Aktivitäten', icon: Activity, requireAdmin: true },
  { href: '/admin/users', label: 'Benutzer', icon: Users, requireAdmin: true },
  { href: '/admin/locations', label: 'Standorte', icon: Building2, requireAdmin: true },
  { href: '/admin/settings', label: 'Einstellungen', icon: Settings, requireAdmin: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const permissions = usePermissions();
  const { user } = useAuthStore();

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  const filteredAdminItems = adminNavItems.filter((item) => {
    if (item.requireAdmin) {
      return permissions.canAccessAdminPanel;
    }
    return true;
  });

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-50 w-64 flex-col bg-slate-900 text-slate-100">
      {/* Logo/Branding */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
          <Building2 className="h-5 w-5 text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-white">FacilityTrack</span>
          <span className="text-xs text-slate-400">Facility Management</span>
        </div>
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
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Admin Navigation */}
        {filteredAdminItems.length > 0 && (
          <>
            <div className="my-4 border-t border-slate-800" />
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
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </nav>

      {/* User Profile Section */}
      <div className="border-t border-slate-800 p-4">
        <Link
          href="/profile"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
            isActive('/profile')
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          )}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700">
            <User className="h-5 w-5" />
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="truncate text-sm font-medium">
              {user?.full_name || 'Benutzer'}
            </span>
            <span className="truncate text-xs text-slate-400">
              {user?.email || ''}
            </span>
          </div>
        </Link>
      </div>
    </aside>
  );
}
