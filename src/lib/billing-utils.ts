import type { SubscriptionInterval } from '@/types/database';

export type BillingMode = 'advance' | 'arrears';

/** Format a Date as YYYY-MM-DD using local year/month/day (avoids toISOString UTC shift) */
export function formatDateLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MONTHS_MAP: Record<SubscriptionInterval, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  annually: 12,
};

/** Parse a YYYY-MM-DD string into [year, month, day] without timezone issues */
function parseDateParts(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split('-').map(Number);
  return [y, m, d];
}

/** Count calendar days between two YYYY-MM-DD strings (inclusive) */
function daysBetween(startStr: string, endStr: string): number {
  const [sy, sm, sd] = parseDateParts(startStr);
  const [ey, em, ed] = parseDateParts(endStr);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

export interface PeriodResult {
  period_start: string;
  period_end: string;
  is_prorated: boolean;
  proration_factor: number;
}

/**
 * Calculate billing period dates based on next_billing_date, interval, billing mode,
 * and optional contract_start_date for proration.
 */
export function calculatePeriodDates(
  nextBillingDate: string,
  interval: SubscriptionInterval,
  billingMode: BillingMode = 'advance',
  contractStartDate?: string | null,
): PeriodResult {
  const [year, month, day] = parseDateParts(nextBillingDate);
  const months = MONTHS_MAP[interval];

  let fullPeriodStart: string;
  let fullPeriodEnd: string;

  if (billingMode === 'arrears') {
    // Arrears: next_billing_date marks the end of the period
    // period_end = last day of the month containing next_billing_date
    const periodEndDate = new Date(year, month - 1 + 1, 0); // last day of that month
    fullPeriodEnd = formatDateLocal(periodEndDate);
    // period_start = first day, N months back
    const periodStartDate = new Date(periodEndDate.getFullYear(), periodEndDate.getMonth() - months + 1, 1);
    fullPeriodStart = formatDateLocal(periodStartDate);
  } else {
    // Advance: next_billing_date triggers the upcoming period
    // period_start = first of the next month after next_billing_date
    const periodStart = new Date(year, month, 1); // month is 1-based from string = next month in 0-based Date
    fullPeriodStart = formatDateLocal(periodStart);
    // period_end = last day of the period
    const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + months, 0);
    fullPeriodEnd = formatDateLocal(periodEnd);
  }

  // Check for proration: if contract_start_date is set and falls within the full period
  if (contractStartDate && contractStartDate > fullPeriodStart && contractStartDate <= fullPeriodEnd) {
    const fullDays = daysBetween(fullPeriodStart, fullPeriodEnd);
    const actualDays = daysBetween(contractStartDate, fullPeriodEnd);
    const prorationFactor = Math.round((actualDays / fullDays) * 10000) / 10000;
    return {
      period_start: contractStartDate,
      period_end: fullPeriodEnd,
      is_prorated: true,
      proration_factor: prorationFactor,
    };
  }

  return {
    period_start: fullPeriodStart,
    period_end: fullPeriodEnd,
    is_prorated: false,
    proration_factor: 1,
  };
}

/** Calculate the amount for a billing period, with optional proration */
export function getPeriodAmount(
  yearlyAmount: number,
  interval: SubscriptionInterval,
  prorationFactor: number = 1,
): number {
  let base: number;
  switch (interval) {
    case 'monthly': base = yearlyAmount / 12; break;
    case 'quarterly': base = yearlyAmount / 4; break;
    case 'half_yearly': base = yearlyAmount / 2; break;
    case 'annually': base = yearlyAmount; break;
  }
  return Math.round(base * prorationFactor * 100) / 100;
}

/**
 * Advance next_billing_date after a successful billing run.
 * If the period was prorated, align to the next full cycle boundary.
 */
export function advanceNextBillingDate(
  nextBillingDate: string,
  interval: SubscriptionInterval,
  billingMode: BillingMode = 'advance',
  periodEnd?: string,
  wasProrated?: boolean,
): string {
  const months = MONTHS_MAP[interval];

  if (wasProrated && periodEnd) {
    // After a prorated period, align to the next full cycle
    const [pey, pem] = parseDateParts(periodEnd);
    if (billingMode === 'arrears') {
      // Next billing date = last day of the month that is N months after period_end's month
      const advanced = new Date(pey, pem - 1 + months + 1, 0);
      return formatDateLocal(advanced);
    } else {
      // Next billing date = last day of the month of period_end (so next cycle starts from period_end's month + 1)
      const advanced = new Date(pey, pem - 1 + months + 1, 0);
      return formatDateLocal(advanced);
    }
  }

  const [year, month] = parseDateParts(nextBillingDate);

  if (billingMode === 'arrears') {
    // Advance by N months from end of current period
    const advanced = new Date(year, month - 1 + months + 1, 0);
    return formatDateLocal(advanced);
  } else {
    // Advance: move next_billing_date forward by N months
    const advanced = new Date(year, month - 1 + 1 + months, 0);
    return formatDateLocal(advanced);
  }
}
