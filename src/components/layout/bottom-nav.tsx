'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Clock,
  ClipboardList,
  AlertTriangle,
  User,
} from 'lucide-react';
import { cn, hapticFeedback } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Mobile bottom nav only shows 5 core items
// Admin items are accessible via sidebar on desktop or mobile menu
const navItems: NavItem[] = [
  { href: '/', label: 'Start', icon: Home },
  { href: '/time', label: 'Zeiten', icon: Clock },
  { href: '/tasks', label: 'Aufgaben', icon: ClipboardList },
  { href: '/issues', label: 'Meldungen', icon: AlertTriangle },
  { href: '/profile', label: 'Profil', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

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
                  active ? 'text-primary-900' : 'text-slate-400'
                )}
              />
              <span
                className={cn(
                  'text-xs mt-1 transition-colors',
                  active ? 'text-primary-900 font-medium' : 'text-slate-500'
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
