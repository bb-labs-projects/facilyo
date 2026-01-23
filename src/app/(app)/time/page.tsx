'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { WorkDayCard, TimeEntryList } from '@/components/time-tracking/work-day-card';
import { PullToRefresh } from '@/components/layout/pull-to-refresh';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { swissFormat } from '@/lib/i18n';
import { addDays, subDays, startOfWeek, endOfWeek, format, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import type { WorkDayWithEntries, TimeEntryWithProperty } from '@/types/database';

export default function TimePage() {
  const profile = useAuthStore((state) => state.profile);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');

  // Fetch work days
  const { data: workDays = [], refetch } = useQuery({
    queryKey: ['work-days', profile?.id, selectedDate.toISOString(), viewMode],
    queryFn: async () => {
      const supabase = getClient();

      let startDate: string;
      let endDate: string;

      if (viewMode === 'week') {
        const weekStart = startOfWeek(selectedDate, { locale: de });
        const weekEnd = endOfWeek(selectedDate, { locale: de });
        startDate = format(weekStart, 'yyyy-MM-dd');
        endDate = format(weekEnd, 'yyyy-MM-dd');
      } else {
        startDate = format(selectedDate, 'yyyy-MM-dd');
        endDate = startDate;
      }

      const { data: days, error } = await supabase
        .from('work_days')
        .select(`
          *,
          time_entries (
            *,
            property:properties (*)
          )
        `)
        .eq('user_id', profile!.id)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (error) throw error;
      return days as WorkDayWithEntries[];
    },
    enabled: !!profile?.id,
  });

  const handlePrevious = () => {
    if (viewMode === 'week') {
      setSelectedDate(subDays(selectedDate, 7));
    } else {
      setSelectedDate(subDays(selectedDate, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'week') {
      setSelectedDate(addDays(selectedDate, 7));
    } else {
      setSelectedDate(addDays(selectedDate, 1));
    }
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  const isToday = isSameDay(selectedDate, new Date());

  // Calculate totals
  const totalSeconds = workDays.reduce((acc, day) => {
    return acc + day.time_entries.reduce((entryAcc, entry) => {
      if (!entry.end_time) return entryAcc;
      const start = new Date(entry.start_time).getTime();
      const end = new Date(entry.end_time).getTime();
      const duration = Math.floor((end - start) / 1000);
      return entryAcc + duration - (entry.pause_duration || 0);
    }, 0);
  }, 0);

  const formatDateHeader = () => {
    if (viewMode === 'week') {
      const weekStart = startOfWeek(selectedDate, { locale: de });
      const weekEnd = endOfWeek(selectedDate, { locale: de });
      return `${format(weekStart, 'dd.MM.')} - ${format(weekEnd, 'dd.MM.yyyy')}`;
    }
    return swissFormat.date(selectedDate, 'EEEE, dd. MMMM yyyy');
  };

  return (
    <PageContainer
      header={
        <Header
          title="Zeiterfassung"
          rightElement={
            <div className="flex gap-1">
              <Button
                variant={viewMode === 'day' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('day')}
              >
                Tag
              </Button>
              <Button
                variant={viewMode === 'week' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('week')}
              >
                Woche
              </Button>
            </div>
          }
        />
      }
    >
      <PullToRefresh onRefresh={refetch}>
        {/* Date navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" onClick={handlePrevious}>
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <div className="text-center">
            <p className="font-medium">{formatDateHeader()}</p>
            {!isToday && (
              <button
                onClick={handleToday}
                className="text-xs text-primary-600 hover:underline"
              >
                Heute
              </button>
            )}
          </div>

          <Button variant="ghost" size="icon" onClick={handleNext}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Summary */}
        <div className="bg-primary-50 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-primary-700">Gesamtzeit</span>
            <span className="text-lg font-semibold text-primary-900">
              {swissFormat.durationHuman(totalSeconds)}
            </span>
          </div>
        </div>

        {/* Work days list */}
        {workDays.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Keine Einträge für diesen Zeitraum</p>
          </div>
        ) : (
          <div className="space-y-4">
            {workDays.map((day) => (
              <div key={day.id}>
                <WorkDayCard
                  workDay={day}
                  entries={day.time_entries}
                  isActive={!day.end_time}
                  className="mb-2"
                />
                {day.time_entries.length > 0 && (
                  <TimeEntryList
                    entries={day.time_entries}
                    className="ml-4"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </PullToRefresh>
    </PageContainer>
  );
}
