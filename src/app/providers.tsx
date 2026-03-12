'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { locales, type Locale } from '@/lib/i18n';

// Create a client with sensible defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : undefined;
}

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function LocaleSync() {
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);

  useEffect(() => {
    if (!profile?.preferred_locale) return;
    const dbLocale = profile.preferred_locale as Locale;
    if (!(locales as readonly string[]).includes(dbLocale)) return;
    const cookieLocale = getCookie('facilyo-locale');
    if (dbLocale !== cookieLocale) {
      setCookie('facilyo-locale', dbLocale);
      router.refresh();
    }
  }, [profile?.preferred_locale, router]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((state) => state.initialize);

  // Initialize auth on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <QueryClientProvider client={queryClient}>
      <LocaleSync />
      {children}
    </QueryClientProvider>
  );
}
