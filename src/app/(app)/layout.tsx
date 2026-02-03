'use client';

import { useEffect, useCallback, useRef } from 'react';
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

  // Prevent duplicate refresh calls
  const isRefreshing = useRef(false);
  const lastRefreshTime = useRef(0);

  // Refresh session and timer state with debouncing
  const refreshState = useCallback(async () => {
    if (!isAuthenticated) return;

    // Prevent duplicate calls within 2 seconds
    const now = Date.now();
    if (isRefreshing.current || now - lastRefreshTime.current < 2000) {
      return;
    }

    isRefreshing.current = true;
    lastRefreshTime.current = now;

    try {
      const supabase = getClient();

      // First check current session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // Session expired - redirect to login
        console.log('Session expired, redirecting to login');
        router.push('/login');
        return;
      }

      // Check if token is close to expiring (within 5 minutes)
      const expiresAt = session.expires_at;
      const nowSeconds = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = expiresAt ? expiresAt - nowSeconds : 0;

      if (timeUntilExpiry < 300) {
        // Token expires soon - force refresh
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          console.log('Failed to refresh session, redirecting to login');
          router.push('/login');
          return;
        }
      }

      // Reinitialize timer from server
      await initializeTimer();
    } catch (error) {
      // Ignore abort errors - they happen when switching tabs quickly
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('Failed to refresh state:', error);

      // On any auth error, redirect to login
      if (error instanceof Error &&
          (error.message.includes('JWT') ||
           error.message.includes('token') ||
           error.message.includes('session'))) {
        router.push('/login');
      }
    } finally {
      isRefreshing.current = false;
    }
  }, [isAuthenticated, initializeTimer, router]);

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

    // Only use visibilitychange - it's more reliable and prevents duplicate calls
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
