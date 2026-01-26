'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Home,
  Clock,
  ClipboardList,
  AlertTriangle,
  Activity,
  User,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuthStore } from '@/stores/auth-store';
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
];

interface MobileMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileMenu({ open, onOpenChange }: MobileMenuProps) {
  const pathname = usePathname();
  const permissions = usePermissions();
  const { user, profile } = useAuthStore();

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

  const handleNavClick = () => {
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] bg-primary-900 p-0 text-slate-100 border-primary-800">
        {/* Logo/Branding */}
        <div className="flex items-center justify-center border-b border-primary-800 p-4 bg-slate-50">
          <Image
            src="/logo.png"
            alt="Flückiger Hauswartung"
            width={200}
            height={60}
            className="w-full object-contain"
          />
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
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span>{item.label}</span>
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
        <div className="absolute bottom-0 left-0 right-0 border-t border-primary-800 p-4">
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
