'use client';

import { usePathname } from 'next/navigation';
import {
  Home,
  Clock,
  ClipboardList,
  AlertTriangle,
  Palmtree,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn, hapticFeedback } from '@/lib/utils';
import { useOpenIssuesCount } from '@/hooks/use-open-issues-count';
import { useVacationNotificationCount } from '@/hooks/use-vacation-notification-count';
import { useNewTasksNotificationCount } from '@/hooks/use-new-tasks-notification-count';

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Mobile bottom nav only shows 5 core items
// Admin items are accessible via sidebar on desktop or mobile menu
const navItems: NavItem[] = [
  { href: '/', labelKey: 'start', icon: Home },
  { href: '/time', labelKey: 'time', icon: Clock },
  { href: '/tasks', labelKey: 'tasks', icon: ClipboardList },
  { href: '/issues', labelKey: 'issues', icon: AlertTriangle },
  { href: '/vacation', labelKey: 'vacation', icon: Palmtree },
];

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const openIssuesCount = useOpenIssuesCount();
  const { count: vacationCount } = useVacationNotificationCount();
  const { count: newTasksCount } = useNewTasksNotificationCount();

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
    <nav className="bottom-nav lg:hidden" role="navigation" aria-label="Hauptnavigation">
      <div className="flex items-stretch">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <a
              key={item.href}
              href={item.href}
              onClick={handleNavClick}
              className={cn(
                'bottom-nav-item',
                active && 'active'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <span className="relative">
                <Icon
                  className={cn(
                    'w-6 h-6 transition-colors',
                    active ? 'text-primary-600' : 'text-muted-foreground'
                  )}
                />
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
              {item.href === '/tasks' && newTasksCount > 0 && (
                <span className="sr-only">{newTasksCount} neue</span>
              )}
              {item.href === '/issues' && openIssuesCount > 0 && (
                <span className="sr-only">{openIssuesCount} offen</span>
              )}
              {item.href === '/vacation' && vacationCount > 0 && (
                <span className="sr-only">{vacationCount} offen</span>
              )}
              <span
                className={cn(
                  'text-xs mt-1 transition-colors',
                  active ? 'text-primary-600 font-medium' : 'text-muted-foreground'
                )}
              >
                {t(item.labelKey)}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
