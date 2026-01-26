'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BottomNav } from '@/components/layout/bottom-nav';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileMenuProvider } from '@/contexts/mobile-menu-context';
import { useAuthStore } from '@/stores/auth-store';
import { useTimerStore } from '@/stores/timer-store';
import { getClient } from '@/lib/supabase/client';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const initializeTimer = useTimerStore((state) => state.initializeFromServer);

  // Refresh session and timer state
  const refreshState = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      // Refresh Supabase session
      const supabase = getClient();
      await supabase.auth.getSession();

      // Reinitialize timer from server
      await initializeTimer();
    } catch (error) {
      console.error('Failed to refresh state:', error);
    }
  }, [isAuthenticated, initializeTimer]);

  // Initialize timer state on mount
  useEffect(() => {
    if (isAuthenticated) {
      initializeTimer();
    }
  }, [isAuthenticated, initializeTimer]);

  // Handle visibility change - refresh state when user returns to tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshState();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also refresh on focus (for browsers that don't fire visibilitychange)
    window.addEventListener('focus', refreshState);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refreshState);
    };
  }, [refreshState]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-900" />
      </div>
    );
  }

  // Don't render if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <MobileMenuProvider>
      <div className="min-h-screen bg-slate-50">
        {/* Desktop Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="lg:ml-64">
          <div className="pb-20 lg:pb-0">
            {children}
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <BottomNav />
      </div>
    </MobileMenuProvider>
  );
}
