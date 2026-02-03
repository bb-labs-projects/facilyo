'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';

// Create a client with settings optimized for always-fresh data
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // Data is always considered stale - ensures fresh data
      refetchOnWindowFocus: true, // Refetch when user returns to tab
      refetchOnMount: true, // Refetch when component mounts
      refetchOnReconnect: true, // Refetch when network reconnects
      retry: (failureCount, error) => {
        // Don't retry on auth errors
        if (error instanceof Error) {
          const message = error.message.toLowerCase();
          if (message.includes('jwt') ||
              message.includes('token') ||
              message.includes('unauthorized') ||
              message.includes('403') ||
              message.includes('401')) {
            return false;
          }
        }
        return failureCount < 1;
      },
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const initialize = useAuthStore((state) => state.initialize);
  const logout = useAuthStore((state) => state.logout);

  // Handle session expiration
  const handleSessionExpired = useCallback(async () => {
    console.log('Session expired, logging out');
    await logout();
    queryClient.clear();
    router.push('/login');
  }, [logout, router]);

  // Initialize auth on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Listen for Supabase auth state changes
  useEffect(() => {
    const supabase = getClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' && !session) {
        handleSessionExpired();
      }

      if (event === 'TOKEN_REFRESHED' && session) {
        // Token was refreshed successfully - invalidate queries to get fresh data
        queryClient.invalidateQueries();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [handleSessionExpired]);

  // Periodic session check every 5 minutes
  useEffect(() => {
    const checkSession = async () => {
      const supabase = getClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        handleSessionExpired();
        return;
      }

      // Check if token expires within 10 minutes
      const expiresAt = session.expires_at;
      const nowSeconds = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = expiresAt ? expiresAt - nowSeconds : 0;

      if (timeUntilExpiry < 600 && timeUntilExpiry > 0) {
        // Proactively refresh session
        await supabase.auth.refreshSession();
      }
    };

    // Check immediately
    checkSession();

    // Then check every 5 minutes
    const interval = setInterval(checkSession, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [handleSessionExpired]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
