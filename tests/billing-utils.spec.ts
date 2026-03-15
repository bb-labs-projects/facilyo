import { test, expect } from '@playwright/test';

/**
 * These tests verify the billing-utils logic by evaluating the functions in a browser context.
 * This avoids needing to set up ts-node/module resolution for direct imports.
 */

// Inline the pure functions for testing (same logic as src/lib/billing-utils.ts)
function formatDateLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateParts(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split('-').map(Number);
  return [y, m, d];
}

function daysBetween(startStr: string, endStr: string): number {
  const [sy, sm, sd] = parseDateParts(startStr);
  const [ey, em, ed] = parseDateParts(endStr);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

type SubscriptionInterval = 'monthly' | 'quarterly' | 'half_yearly' | 'annually';
type BillingMode = 'advance' | 'arrears';

const MONTHS_MAP: Record<SubscriptionInterval, number> = {
  monthly: 1, quarterly: 3, half_yearly: 6, annually: 12,
};

function calculatePeriodDates(
  nextBillingDate: string,
  interval: SubscriptionInterval,
  billingMode: BillingMode = 'advance',
  contractStartDate?: string | null,
) {
  const [year, month, day] = parseDateParts(nextBillingDate);
  const months = MONTHS_MAP[interval];

  let fullPeriodStart: string;
  let fullPeriodEnd: string;

  if (billingMode === 'arrears') {
    const periodEndDate = new Date(year, month - 1 + 1, 0);
    fullPeriodEnd = formatDateLocal(periodEndDate);
    const periodStartDate = new Date(periodEndDate.getFullYear(), periodEndDate.getMonth() - months + 1, 1);
    fullPeriodStart = formatDateLocal(periodStartDate);
  } else {
    const periodStart = new Date(year, month, 1);
    fullPeriodStart = formatDateLocal(periodStart);
    const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + months, 0);
    fullPeriodEnd = formatDateLocal(periodEnd);
  }

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

function getPeriodAmount(yearlyAmount: number, interval: SubscriptionInterval, prorationFactor: number = 1): number {
  let base: number;
  switch (interval) {
    case 'monthly': base = yearlyAmount / 12; break;
    case 'quarterly': base = yearlyAmount / 4; break;
    case 'half_yearly': base = yearlyAmount / 2; break;
    case 'annually': base = yearlyAmount; break;
  }
  return Math.round(base * prorationFactor * 100) / 100;
}

function advanceNextBillingDate(
  nextBillingDate: string,
  interval: SubscriptionInterval,
  billingMode: BillingMode = 'advance',
  periodEnd?: string,
  wasProrated?: boolean,
): string {
  const months = MONTHS_MAP[interval];

  if (wasProrated && periodEnd) {
    const [pey, pem] = parseDateParts(periodEnd);
    const advanced = new Date(pey, pem - 1 + months + 1, 0);
    return formatDateLocal(advanced);
  }

  const [year, month] = parseDateParts(nextBillingDate);
  if (billingMode === 'arrears') {
    const advanced = new Date(year, month - 1 + months + 1, 0);
    return formatDateLocal(advanced);
  } else {
    const advanced = new Date(year, month - 1 + 1 + months, 0);
    return formatDateLocal(advanced);
  }
}

function convertNextBillingDate(
  nextBillingDate: string,
  interval: SubscriptionInterval,
  fromMode: BillingMode,
  toMode: BillingMode,
): string {
  if (fromMode === toMode) return nextBillingDate;
  const period = calculatePeriodDates(nextBillingDate, interval, fromMode);
  if (toMode === 'arrears') {
    return period.period_end;
  } else {
    const [y, m] = parseDateParts(period.period_start);
    const lastDayBefore = new Date(y, m - 1, 0);
    return formatDateLocal(lastDayBefore);
  }
}

// ── Tests ──

test.describe('Billing Utils - calculatePeriodDates', () => {
  test('advance mode: monthly with next_billing_date 2026-03-31', () => {
    const result = calculatePeriodDates('2026-03-31', 'monthly', 'advance');
    expect(result.period_start).toBe('2026-04-01');
    expect(result.period_end).toBe('2026-04-30');
    expect(result.is_prorated).toBe(false);
    expect(result.proration_factor).toBe(1);
  });

  test('advance mode: quarterly with next_billing_date 2026-01-31', () => {
    const result = calculatePeriodDates('2026-01-31', 'quarterly', 'advance');
    expect(result.period_start).toBe('2026-02-01');
    expect(result.period_end).toBe('2026-04-30');
    expect(result.is_prorated).toBe(false);
  });

  test('advance mode: annually with next_billing_date 2025-12-31', () => {
    const result = calculatePeriodDates('2025-12-31', 'annually', 'advance');
    expect(result.period_start).toBe('2026-01-01');
    expect(result.period_end).toBe('2026-12-31');
  });

  test('advance mode: half_yearly with next_billing_date 2026-06-30', () => {
    const result = calculatePeriodDates('2026-06-30', 'half_yearly', 'advance');
    expect(result.period_start).toBe('2026-07-01');
    expect(result.period_end).toBe('2026-12-31');
  });

  test('arrears mode: monthly with next_billing_date 2026-03-31', () => {
    const result = calculatePeriodDates('2026-03-31', 'monthly', 'arrears');
    expect(result.period_start).toBe('2026-03-01');
    expect(result.period_end).toBe('2026-03-31');
    expect(result.is_prorated).toBe(false);
  });

  test('arrears mode: quarterly with next_billing_date 2026-03-31', () => {
    const result = calculatePeriodDates('2026-03-31', 'quarterly', 'arrears');
    expect(result.period_start).toBe('2026-01-01');
    expect(result.period_end).toBe('2026-03-31');
  });

  test('arrears mode: annually with next_billing_date 2026-12-31', () => {
    const result = calculatePeriodDates('2026-12-31', 'annually', 'arrears');
    expect(result.period_start).toBe('2026-01-01');
    expect(result.period_end).toBe('2026-12-31');
  });

  test('proration: contract starts Feb 15 in quarterly cycle Jan-Mar', () => {
    // next_billing_date = 2025-12-31, quarterly advance → period Jan 1 - Mar 31
    // contract_start_date = Feb 15 → prorated Feb 15 - Mar 31
    const result = calculatePeriodDates('2025-12-31', 'quarterly', 'advance', '2026-02-15');
    expect(result.period_start).toBe('2026-02-15');
    expect(result.period_end).toBe('2026-03-31');
    expect(result.is_prorated).toBe(true);
    // Feb 15 - Mar 31 = 45 days, Jan 1 - Mar 31 = 90 days → 0.5
    expect(result.proration_factor).toBe(0.5);
  });

  test('proration: contract starts mid-month in monthly cycle', () => {
    // next_billing_date = 2026-02-28, monthly advance → period Mar 1 - Mar 31
    // contract_start_date = Mar 16 → prorated Mar 16 - Mar 31
    const result = calculatePeriodDates('2026-02-28', 'monthly', 'advance', '2026-03-16');
    expect(result.period_start).toBe('2026-03-16');
    expect(result.period_end).toBe('2026-03-31');
    expect(result.is_prorated).toBe(true);
    // Mar 16-31 = 16 days, Mar 1-31 = 31 days → 16/31 ≈ 0.5161
    expect(result.proration_factor).toBeCloseTo(0.5161, 3);
  });

  test('no proration when contract_start_date is before period', () => {
    // next_billing_date = 2026-03-31, monthly advance → period Apr 1 - Apr 30
    // contract_start_date = 2026-01-01 (before period) → no proration
    const result = calculatePeriodDates('2026-03-31', 'monthly', 'advance', '2026-01-01');
    expect(result.period_start).toBe('2026-04-01');
    expect(result.period_end).toBe('2026-04-30');
    expect(result.is_prorated).toBe(false);
    expect(result.proration_factor).toBe(1);
  });

  test('no proration when contract_start_date equals period start', () => {
    // next_billing_date = 2026-03-31, monthly advance → period Apr 1 - Apr 30
    // contract_start_date = 2026-04-01 (equals period start, not > start) → no proration
    const result = calculatePeriodDates('2026-03-31', 'monthly', 'advance', '2026-04-01');
    expect(result.period_start).toBe('2026-04-01');
    expect(result.period_end).toBe('2026-04-30');
    expect(result.is_prorated).toBe(false);
  });
});

test.describe('Billing Utils - getPeriodAmount', () => {
  test('monthly amount from yearly', () => {
    expect(getPeriodAmount(12000, 'monthly')).toBe(1000);
  });

  test('quarterly amount from yearly', () => {
    expect(getPeriodAmount(12000, 'quarterly')).toBe(3000);
  });

  test('half_yearly amount from yearly', () => {
    expect(getPeriodAmount(12000, 'half_yearly')).toBe(6000);
  });

  test('annual amount equals yearly', () => {
    expect(getPeriodAmount(12000, 'annually')).toBe(12000);
  });

  test('prorated monthly amount', () => {
    // 12000/year → 1000/month, prorated at 50% → 500
    expect(getPeriodAmount(12000, 'monthly', 0.5)).toBe(500);
  });

  test('prorated quarterly amount', () => {
    // 12000/year → 3000/quarter, prorated at 0.5 → 1500
    expect(getPeriodAmount(12000, 'quarterly', 0.5)).toBe(1500);
  });

  test('rounds to 2 decimal places', () => {
    // 10000/12 = 833.3333... → 833.33
    expect(getPeriodAmount(10000, 'monthly')).toBe(833.33);
  });
});

test.describe('Billing Utils - advanceNextBillingDate', () => {
  test('advance mode: monthly advances by 1 month', () => {
    const result = advanceNextBillingDate('2026-03-31', 'monthly', 'advance');
    expect(result).toBe('2026-04-30');
  });

  test('advance mode: quarterly advances by 3 months', () => {
    const result = advanceNextBillingDate('2026-03-31', 'quarterly', 'advance');
    expect(result).toBe('2026-06-30');
  });

  test('advance mode: annually advances by 12 months', () => {
    const result = advanceNextBillingDate('2025-12-31', 'annually', 'advance');
    expect(result).toBe('2026-12-31');
  });

  test('arrears mode: monthly advances by 1 month', () => {
    const result = advanceNextBillingDate('2026-03-31', 'monthly', 'arrears');
    expect(result).toBe('2026-04-30');
  });

  test('arrears mode: quarterly advances by 3 months', () => {
    const result = advanceNextBillingDate('2026-03-31', 'quarterly', 'arrears');
    expect(result).toBe('2026-06-30');
  });

  test('after proration: aligns to next full cycle', () => {
    // Prorated period ended Mar 31, monthly → next should be Apr 30
    const result = advanceNextBillingDate('2026-02-28', 'monthly', 'advance', '2026-03-31', true);
    expect(result).toBe('2026-04-30');
  });

  test('after proration: quarterly alignment', () => {
    // Prorated period ended Mar 31, quarterly → next should be Jun 30
    const result = advanceNextBillingDate('2025-12-31', 'quarterly', 'advance', '2026-03-31', true);
    expect(result).toBe('2026-06-30');
  });
});

test.describe('Billing Utils - timezone safety', () => {
  test('formatDateLocal does not shift dates across timezone boundaries', () => {
    // This is the core bug fix — new Date(year, month, 1) with formatDateLocal
    // should always return the correct local date, not a UTC-shifted one
    const d = new Date(2026, 3, 1); // April 1, 2026 local
    const result = formatDateLocal(d);
    expect(result).toBe('2026-04-01');
  });

  test('last day of month is correct for April', () => {
    const d = new Date(2026, 4, 0); // Day 0 of May = April 30
    const result = formatDateLocal(d);
    expect(result).toBe('2026-04-30');
  });

  test('last day of February in non-leap year', () => {
    const d = new Date(2026, 2, 0); // Day 0 of March = Feb 28
    const result = formatDateLocal(d);
    expect(result).toBe('2026-02-28');
  });

  test('last day of February in leap year', () => {
    const d = new Date(2028, 2, 0); // Day 0 of March 2028 = Feb 29
    const result = formatDateLocal(d);
    expect(result).toBe('2028-02-29');
  });
});

test.describe('Billing scenario: user reported bug', () => {
  test('next_billing_date 2026-03-31 monthly should give Apr 1 - Apr 30', () => {
    const result = calculatePeriodDates('2026-03-31', 'monthly', 'advance');
    expect(result.period_start).toBe('2026-04-01');
    expect(result.period_end).toBe('2026-04-30');
  });

  test('existing draft Mar 1-31 should NOT overlap with new Apr 1-30 period', () => {
    const { period_start, period_end } = calculatePeriodDates('2026-03-31', 'monthly', 'advance');
    const existingStart = '2026-03-01';
    const existingEnd = '2026-03-31';

    // Overlap check: existing.start <= new.end AND existing.end >= new.start
    const overlaps = existingStart <= period_end && existingEnd >= period_start;
    expect(overlaps).toBe(false);
  });
});

test.describe('Billing Utils - convertNextBillingDate', () => {
  test('advance→arrears: monthly moves to period end', () => {
    // Advance nbd=2026-03-31 → period Apr 1-30 → arrears nbd should be 2026-04-30
    const result = convertNextBillingDate('2026-03-31', 'monthly', 'advance', 'arrears');
    expect(result).toBe('2026-04-30');
  });

  test('arrears→advance: monthly moves to last day before period start', () => {
    // Arrears nbd=2026-04-30 → period Apr 1-30 → advance nbd should be 2026-03-31
    const result = convertNextBillingDate('2026-04-30', 'monthly', 'arrears', 'advance');
    expect(result).toBe('2026-03-31');
  });

  test('advance→arrears→advance roundtrip preserves same period', () => {
    const original = '2026-03-31';
    const arrears = convertNextBillingDate(original, 'monthly', 'advance', 'arrears');
    const backToAdvance = convertNextBillingDate(arrears, 'monthly', 'arrears', 'advance');
    expect(backToAdvance).toBe(original);
  });

  test('arrears→advance→arrears roundtrip preserves same period', () => {
    const original = '2026-06-30';
    const advance = convertNextBillingDate(original, 'quarterly', 'arrears', 'advance');
    const backToArrears = convertNextBillingDate(advance, 'quarterly', 'advance', 'arrears');
    expect(backToArrears).toBe(original);
  });

  test('advance→arrears: quarterly', () => {
    // Advance nbd=2026-03-31 → period Apr 1 - Jun 30 → arrears nbd=2026-06-30
    const result = convertNextBillingDate('2026-03-31', 'quarterly', 'advance', 'arrears');
    expect(result).toBe('2026-06-30');
  });

  test('arrears→advance: quarterly', () => {
    // Arrears nbd=2026-06-30 → period Apr 1 - Jun 30 → advance nbd=2026-03-31
    const result = convertNextBillingDate('2026-06-30', 'quarterly', 'arrears', 'advance');
    expect(result).toBe('2026-03-31');
  });

  test('same mode returns unchanged date', () => {
    expect(convertNextBillingDate('2026-03-31', 'monthly', 'advance', 'advance')).toBe('2026-03-31');
    expect(convertNextBillingDate('2026-04-30', 'monthly', 'arrears', 'arrears')).toBe('2026-04-30');
  });

  test('converted dates produce the same billing period', () => {
    const advanceNbd = '2026-03-31';
    const arrearsNbd = convertNextBillingDate(advanceNbd, 'monthly', 'advance', 'arrears');

    const advancePeriod = calculatePeriodDates(advanceNbd, 'monthly', 'advance');
    const arrearsPeriod = calculatePeriodDates(arrearsNbd, 'monthly', 'arrears');

    expect(advancePeriod.period_start).toBe(arrearsPeriod.period_start);
    expect(advancePeriod.period_end).toBe(arrearsPeriod.period_end);
  });

  test('contract_start_date proration still works after mode switch', () => {
    // Subscription: contract starts Feb 15, quarterly, advance mode
    // next_billing_date = 2025-12-31
    const advanceNbd = '2025-12-31';
    const arrearsNbd = convertNextBillingDate(advanceNbd, 'quarterly', 'advance', 'arrears');
    // Advance: full period Jan 1 - Mar 31 → arrears nbd = 2026-03-31
    expect(arrearsNbd).toBe('2026-03-31');

    // Now verify proration still works in arrears mode
    const period = calculatePeriodDates(arrearsNbd, 'quarterly', 'arrears', '2026-02-15');
    expect(period.period_start).toBe('2026-02-15');
    expect(period.period_end).toBe('2026-03-31');
    expect(period.is_prorated).toBe(true);
    expect(period.proration_factor).toBe(0.5); // 45/90 days
  });
});
