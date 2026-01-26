'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, MoreVertical, Menu } from 'lucide-react';
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
}: HeaderProps) {
  const router = useRouter();
  const mobileMenu = useMobileMenu();

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full bg-background border-b border-border',
        'standalone-header',
        className
      )}
    >
      <div className="flex h-14 items-center px-4">
        {/* Left section */}
        <div className="flex items-center gap-2 flex-1">
          {/* Hamburger menu for mobile */}
          {showMobileMenu && !showBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onMenuClick || mobileMenu.open}
              className="-ml-2 lg:hidden"
              aria-label="Menü öffnen"
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
              aria-label="Zurück"
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
        {rightElement && (
          <div className="flex items-center gap-2">{rightElement}</div>
        )}
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
        <Button variant="ghost" size="icon" aria-label="Menü">
          <MoreVertical className="h-5 w-5" />
        </Button>
      )}
      {/* Dropdown content would go here with @radix-ui/react-dropdown-menu */}
      {children}
    </div>
  );
}
