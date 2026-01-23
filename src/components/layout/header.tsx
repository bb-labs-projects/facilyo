'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backHref?: string;
  rightElement?: React.ReactNode;
  className?: string;
}

export function Header({
  title,
  subtitle,
  showBack = false,
  backHref,
  rightElement,
  className,
}: HeaderProps) {
  const router = useRouter();

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
        'sticky top-0 z-40 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        'border-b border-border',
        'standalone-header',
        className
      )}
    >
      <div className="flex h-14 items-center px-4">
        {/* Left section */}
        <div className="flex items-center gap-2 flex-1">
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="-ml-2"
              aria-label="Zurück"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold leading-tight">{title}</h1>
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
          !noPadding && 'p-4',
          // Account for bottom nav
          'pb-24',
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
