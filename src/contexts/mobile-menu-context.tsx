'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { MobileMenu } from '@/components/layout/mobile-menu';

interface MobileMenuContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const MobileMenuContext = createContext<MobileMenuContextType | undefined>(undefined);

export function MobileMenuProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <MobileMenuContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
      <MobileMenu open={isOpen} onOpenChange={setIsOpen} />
    </MobileMenuContext.Provider>
  );
}

export function useMobileMenu(): MobileMenuContextType {
  const context = useContext(MobileMenuContext);
  // Return a no-op version when used outside of provider (e.g., auth pages)
  if (context === undefined) {
    return {
      isOpen: false,
      open: () => {},
      close: () => {},
      toggle: () => {},
    };
  }
  return context;
}
