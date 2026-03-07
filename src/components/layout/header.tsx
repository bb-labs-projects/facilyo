'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, MoreVertical, Menu, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMobileMenu } from '@/contexts/mobile-menu-context';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backHref?: string;
  rightElement?: React.ReactNode;
  className?: string;
  onMenuClick?: () => void;
  showMobileMenu?: boolean;
  showRefresh?: boolean;
  onRefresh?: () => void | Promise<void>;
}

export function Header({
  title,
  subtitle,
  showBack = false,
  backHref,
  rightElement,
  className,
  onMenuClick,
  showMobileMenu = true,
  showRefresh = true,
  onRefresh,
}: HeaderProps) {
  const router = useRouter();
  const mobileMenu = useMobileMenu();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        window.location.reload();
      }
    } finally {
      // Keep spinning for a moment to show feedback
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full bg-slate-50 border-b border-slate-200',
        'standalone-header',
        className
      )}
    >
      <div className="flex h-[60px] items-center px-4">
        {/* Left section */}
        <div className="flex items-center gap-2 flex-1">
          {/* Hamburger menu for mobile */}
          {showMobileMenu && !showBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onMenuClick || mobileMenu.open}
              className="-ml-2 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6 text-foreground" />
            </Button>
          )}
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="-ml-2"
              aria-label="Back"
            >
              <ChevronLeft className="h-6 w-6 text-foreground" />
            </Button>
          )}
          <div className="flex flex-col">
            <h1 className="text-lg font-bold leading-tight text-foreground">{title}</h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2">
          {/* Refresh button - mobile only */}
          {showRefresh && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="lg:hidden"
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-5 w-5', isRefreshing && 'animate-spin')} />
            </Button>
          )}
          {rightElement}
        </div>
      </div>
    </header>
  );
}

interface PageContainerProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function PageContainer({
  children,
  header,
  className,
  noPadding = false,
}: PageContainerProps) {
  return (
    <div className="flex min-h-screen flex-col">
      {header}
      <main
        className={cn(
          'flex-1',
          !noPadding && 'p-4 lg:p-6',
          // Account for bottom nav on mobile, no extra padding on desktop
          'pb-24 lg:pb-6',
          className
        )}
      >
        {children}
      </main>
    </div>
  );
}

interface DropdownMenuProps {
  children: React.ReactNode;
  trigger?: React.ReactNode;
}

export function HeaderMenu({ children, trigger }: DropdownMenuProps) {
  return (
    <div className="relative">
      {trigger || (
        <Button variant="ghost" size="icon" aria-label="Menu">
          <MoreVertical className="h-5 w-5" />
        </Button>
      )}
      {/* Dropdown content would go here with @radix-ui/react-dropdown-menu */}
      {children}
    </div>
  );
}
