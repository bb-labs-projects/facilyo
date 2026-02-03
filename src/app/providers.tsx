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
      gcTime: 5 * 60 * 1000, // Garbage collect after 5 minutes
      refetchOnWindowFocus: 'always', // Always refetch on tab switch
      refetchOnMount: 'always', // Always refetch when component mounts
      refetchOnReconnect: 'always', // Always refetch when network reconnects
      networkMode: 'always', // Try to fetch even if offline
      retry: (failureCount, error) => {
        // Don't retry on auth errors
        if (error instanceof Error) {
          const message = error.message.toLowerCase();
          if (message.includes('jwt') ||
              message.includes('token') ||
              message.includes('unauthorized') ||
              message.includes('403') ||
              message.includes('401') ||
              message.includes('pgrst')) {
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
      console.log('Auth state change:', event, !!session);

      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        handleSessionExpired();
      }

      if (event === 'TOKEN_REFRESHED' && session) {
        // Token was refreshed successfully - cancel and refetch all queries
        queryClient.cancelQueries();
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
