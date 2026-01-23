import { getRequestConfig } from 'next-intl/server';
import { format, formatDistance, formatRelative, parseISO } from 'date-fns';
import { de, deCH } from 'date-fns/locale';

// Default locale
export const defaultLocale = 'de-CH';
export const locales = ['de-CH', 'de-DE'] as const;
export type Locale = (typeof locales)[number];

// Get date-fns locale
const dateFnsLocales = {
  'de-CH': deCH,
  'de-DE': de,
};

export function getDateFnsLocale(locale: Locale = defaultLocale) {
  return dateFnsLocales[locale] || deCH;
}

// next-intl config
export default getRequestConfig(async () => {
  const locale = defaultLocale;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

// Swiss German formatting utilities
export const swissFormat = {
  /**
   * Format date in Swiss style: "23. Januar 2024"
   */
  date(date: Date | string, formatStr: string = 'dd. MMMM yyyy'): string {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, formatStr, { locale: deCH });
  },

  /**
   * Format short date: "23.01.2024"
   */
  dateShort(date: Date | string): string {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, 'dd.MM.yyyy', { locale: deCH });
  },

  /**
   * Format time: "14:30"
   */
  time(date: Date | string): string {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, 'HH:mm', { locale: deCH });
  },

  /**
   * Format time with seconds: "14:30:45"
   */
  timeWithSeconds(date: Date | string): string {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, 'HH:mm:ss', { locale: deCH });
  },

  /**
   * Format datetime: "23.01.2024 14:30"
   */
  datetime(date: Date | string): string {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, 'dd.MM.yyyy HH:mm', { locale: deCH });
  },

  /**
   * Format relative time: "vor 5 Minuten"
   */
  relative(date: Date | string, baseDate: Date = new Date()): string {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return formatDistance(d, baseDate, { addSuffix: true, locale: deCH });
  },

  /**
   * Format relative with day context: "gestern um 14:30"
   */
  relativeWithDay(date: Date | string, baseDate: Date = new Date()): string {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return formatRelative(d, baseDate, { locale: deCH });
  },

  /**
   * Format weekday: "Montag"
   */
  weekday(date: Date | string): string {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, 'EEEE', { locale: deCH });
  },

  /**
   * Format weekday short: "Mo"
   */
  weekdayShort(date: Date | string): string {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, 'EE', { locale: deCH });
  },

  /**
   * Format duration in HH:MM:SS
   */
  duration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0'),
    ].join(':');
  },

  /**
   * Format duration in human readable: "2 Std. 30 Min."
   */
  durationHuman(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours === 0) {
      return `${minutes} Min.`;
    }
    if (minutes === 0) {
      return `${hours} Std.`;
    }
    return `${hours} Std. ${minutes} Min.`;
  },

  /**
   * Format currency in CHF: "CHF 1'234.50"
   */
  currency(amount: number): string {
    return new Intl.NumberFormat('de-CH', {
      style: 'currency',
      currency: 'CHF',
    }).format(amount);
  },

  /**
   * Format number with Swiss style thousands separator: "1'234'567.89"
   */
  number(value: number, decimals: number = 2): string {
    return new Intl.NumberFormat('de-CH', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  },

  /**
   * Format percentage: "75.5%"
   */
  percent(value: number, decimals: number = 1): string {
    return new Intl.NumberFormat('de-CH', {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value / 100);
  },

  /**
   * Format phone number in Swiss style: "+41 79 123 45 67"
   */
  phone(phone: string): string {
    // Remove all non-digits except leading +
    const cleaned = phone.replace(/[^\d+]/g, '');

    // Swiss mobile format
    if (cleaned.startsWith('+41')) {
      const number = cleaned.slice(3);
      if (number.length === 9) {
        return `+41 ${number.slice(0, 2)} ${number.slice(2, 5)} ${number.slice(5, 7)} ${number.slice(7)}`;
      }
    }

    // Return as-is if not matching expected format
    return phone;
  },
};
