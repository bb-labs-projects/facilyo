'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, parseISO, eachDayOfInterval, isWeekend, isBefore, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { Header, PageContainer } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { VacationRequestInsert } from '@/types/database';

function calculateBusinessDays(start: string, end: string, isHalfDay: boolean): number {
  const startDate = parseISO(start);
  const endDate = parseISO(end);

  if (isHalfDay && start === end) {
    return 0.5;
  }

  const days = eachDayOfInterval({ start: startDate, end: endDate });
  return days.filter((day) => !isWeekend(day)).length;
}

export default function NewVacationRequestPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const today = format(new Date(), 'yyyy-MM-dd');
  const isSingleDay = startDate && endDate && startDate === endDate;

  const totalDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    try {
      return calculateBusinessDays(startDate, endDate, isHalfDay);
    } catch {
      return 0;
    }
  }, [startDate, endDate, isHalfDay]);

  // Fetch used vacation days for the current year (approved + pending)
  const currentYear = new Date().getFullYear();
  const { data: usedDays = 0 } = useQuery({
    queryKey: ['vacation-used-days', profile?.id, currentYear],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('vacation_requests')
        .select('total_days, status')
        .eq('user_id', profile!.id)
        .in('status', ['approved', 'pending'])
        .gte('start_date', `${currentYear}-01-01`)
        .lte('start_date', `${currentYear}-12-31`);

      if (error) throw error;
      return (data as { total_days: number }[]).reduce(
        (sum: number, r: { total_days: number }) => sum + r.total_days,
        0
      );
    },
    enabled: !!profile?.id,
  });

  const totalAllowance = profile?.vacation_days_per_year ?? 0;
  const availableDays = totalAllowance - usedDays;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!startDate) {
      newErrors.startDate = 'Startdatum ist erforderlich';
    } else if (isBefore(parseISO(startDate), startOfDay(new Date()))) {
      newErrors.startDate = 'Startdatum darf nicht in der Vergangenheit liegen';
    }

    if (!endDate) {
      newErrors.endDate = 'Enddatum ist erforderlich';
    } else if (startDate && endDate < startDate) {
      newErrors.endDate = 'Enddatum muss nach dem Startdatum liegen';
    }

    if (totalDays > 0 && totalDays > availableDays) {
      newErrors.totalDays = `Nicht genug Ferientage verfügbar (${availableDays} verbleibend)`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const { mutate: submitRequest, isPending } = useMutation({
    mutationFn: async () => {
      const supabase = getClient();

      const insert: VacationRequestInsert = {
        user_id: profile!.id,
        start_date: startDate,
        end_date: endDate,
        is_half_day: isHalfDay && !!isSingleDay,
        total_days: totalDays,
        notes: notes.trim() || null,
      };

      const { error } = await (supabase as any)
        .from('vacation_requests')
        .insert(insert);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Ferienantrag eingereicht');
      queryClient.invalidateQueries({ queryKey: ['vacation-own'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-pending'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-used-days'] });
      router.push('/vacation');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ferienantrag konnte nicht eingereicht werden');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      submitRequest();
    }
  };

  return (
    <PageContainer
      header={
        <Header
          title="Ferien beantragen"
          showBack
          backHref="/vacation"
        />
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Available days info */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <p className="text-sm text-blue-800 font-medium">
              Verfügbare Ferientage: {availableDays} von {totalAllowance}
            </p>
          </CardContent>
        </Card>

        {/* Date inputs */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Startdatum
              </label>
              <Input
                type="date"
                value={startDate}
                min={today}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (isHalfDay && e.target.value !== endDate) {
                    setIsHalfDay(false);
                  }
                  setErrors((prev) => ({ ...prev, startDate: '' }));
                }}
                required
              />
              {errors.startDate && (
                <p className="text-sm text-red-600 mt-1">{errors.startDate}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Enddatum
              </label>
              <Input
                type="date"
                value={endDate}
                min={startDate || today}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  if (isHalfDay && startDate !== e.target.value) {
                    setIsHalfDay(false);
                  }
                  setErrors((prev) => ({ ...prev, endDate: '' }));
                }}
                required
              />
              {errors.endDate && (
                <p className="text-sm text-red-600 mt-1">{errors.endDate}</p>
              )}
            </div>

            {/* Half-day toggle */}
            {isSingleDay && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isHalfDay}
                  onChange={(e) => setIsHalfDay(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Halber Tag</span>
              </label>
            )}
          </CardContent>
        </Card>

        {/* Business days display */}
        {startDate && endDate && totalDays > 0 && (
          <Card className={cn(
            errors.totalDays ? 'border-red-300 bg-red-50' : 'bg-green-50 border-green-200'
          )}>
            <CardContent className="p-4 text-center">
              <p className={cn(
                'text-2xl font-bold',
                errors.totalDays ? 'text-red-700' : 'text-green-700'
              )}>
                {totalDays} Arbeitstage
              </p>
              {errors.totalDays && (
                <p className="text-sm text-red-600 mt-1">{errors.totalDays}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        <Card>
          <CardContent className="p-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Bemerkungen (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Zusätzliche Informationen..."
            />
          </CardContent>
        </Card>

        {/* Submit */}
        <Button
          type="submit"
          className="w-full"
          disabled={isPending || !startDate || !endDate}
        >
          {isPending ? 'Wird eingereicht...' : 'Ferienantrag einreichen'}
        </Button>
      </form>
    </PageContainer>
  );
}
