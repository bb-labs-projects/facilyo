'use client';

import { Globe } from 'lucide-react';
import { useLocale } from '@/hooks/use-locale';
import { locales, localeNames, type Locale } from '@/lib/i18n';

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 mb-3">
        <Globe className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm font-medium">{localeNames[locale]}</span>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {locales.map((loc) => (
          <button
            key={loc}
            onClick={() => setLocale(loc)}
            className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[44px] ${
              locale === loc
                ? 'bg-primary-100 text-primary-700 font-medium'
                : 'hover:bg-muted/50'
            }`}
          >
            <span>{localeNames[loc]}</span>
            {locale === loc && (
              <span className="text-primary-600 text-xs font-medium">✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
