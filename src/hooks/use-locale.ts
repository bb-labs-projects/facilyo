'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === 'undefined') return 'de-CH';
    return (getCookie('facilyo-locale') as Locale) || 'de-CH';
  });

  useEffect(() => {
    const saved = getCookie('facilyo-locale') as Locale;
    if (saved && saved !== locale) {
      setLocaleState(saved);
    }
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setCookie('facilyo-locale', newLocale);
    setLocaleState(newLocale);
    router.refresh();
  }, [router]);

  return { locale, setLocale };
}

export function getChecklistItemLabel(
  item: { label: string; translations?: Record<string, string> },
  locale: string
): string {
  return item.translations?.[locale] || item.label;
}
