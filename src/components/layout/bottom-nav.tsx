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
} from 'lucide-react';
import { cn, hapticFeedback } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requireAdmin?: boolean;
}

const navItems: NavItem[] = [
  { href: '/', label: 'Start', icon: Home },
  { href: '/time', label: 'Zeiten', icon: Clock },
  { href: '/tasks', label: 'Aufgaben', icon: ClipboardList },
  { href: '/issues', label: 'Meldungen', icon: AlertTriangle },
  { href: '/admin/activity', label: 'Aktivitäten', icon: Activity, requireAdmin: true },
  { href: '/profile', label: 'Profil', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  const permissions = usePermissions();

  const filteredNavItems = navItems.filter((item) => {
    if (item.requireAdmin) {
      return permissions.canAccessAdminPanel;
    }
    return true;
  });

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  const handleNavClick = () => {
    hapticFeedback('light');
  };

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Hauptnavigation">
      <div className="flex items-stretch">
        {filteredNavItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleNavClick}
              className={cn(
                'bottom-nav-item',
                active && 'active'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon
                className={cn(
                  'w-6 h-6 transition-colors',
                  active ? 'text-primary-600' : 'text-muted-foreground'
                )}
              />
              <span
                className={cn(
                  'text-xs mt-1 transition-colors',
                  active ? 'text-primary-600 font-medium' : 'text-muted-foreground'
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
