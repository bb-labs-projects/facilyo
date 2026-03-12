'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import type { Locale } from '@/lib/i18n';

function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : undefined;
}

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function useLocale() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === 'undefined') return 'de-CH';
    return (getCookie('facilyo-locale') as Locale) || 'de-CH';
  });

  // Keep local state in sync with cookie (cookie may be updated by global LocaleSync)
  useEffect(() => {
    const saved = getCookie('facilyo-locale') as Locale;
    if (saved && saved !== locale) {
      setLocaleState(saved);
    }
  }, [profile?.preferred_locale]);

  const setLocale = useCallback(async (newLocale: Locale) => {
    setCookie('facilyo-locale', newLocale);
    setLocaleState(newLocale);
    router.refresh();

    // Persist to database
    if (profile?.id) {
      try {
        const supabase = getClient();
        const { error } = await (supabase as any)
          .from('profiles')
          .update({ preferred_locale: newLocale })
          .eq('id', profile.id);
        if (error) throw error;
        // Update the local profile so LocaleSync stays consistent
        useAuthStore.getState().refreshProfile();
      } catch (error) {
        console.error('Failed to save locale preference:', error);
        toast.error('Failed to save language preference');
      }
    }
  }, [router, profile?.id]);

  return { locale, setLocale };
}

export function getChecklistItemLabel(
  item: { label: string; translations?: Record<string, string> },
  locale: string
): string {
  return item.translations?.[locale] || item.label;
}
