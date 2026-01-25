'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, ChevronLeft, ChevronRight, Car, Coffee, Building2 } from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { WorkDayCard, TimeEntryList } from '@/components/time-tracking/work-day-card';
import { WorkDayDetailSheet } from '@/components/time-tracking/work-day-detail-sheet';
import { PropertyTimeSummary } from '@/components/time-tracking/property-time-summary';
import { WeeklyCalendar } from '@/components/time-tracking/weekly-calendar';
import { PullToRefresh } from '@/components/layout/pull-to-refresh';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { swissFormat } from '@/lib/i18n';
import { addDays, subDays, startOfWeek, endOfWeek, format, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { WorkDayWithEntries, TimeEntryWithProperty, TimeEntryType } from '@/types/database';

// Entry type display config
const ENTRY_TYPE_CONFIG: Record<TimeEntryType, { label: string; icon: typeof Car; color: string }> = {
  property: { label: 'Liegenschaft', icon: Building2, color: 'text-blue-600' },
  travel: { label: 'Fahrzeit', icon: Car, color: 'text-amber-600' },
  break: { label: 'Pause', icon: Coffee, color: 'text-orange-600' },
};

export default function TimePage() {
  const profile = useAuthStore((state) => state.profile);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [selectedWorkDay, setSelectedWorkDay] = useState<WorkDayWithEntries | null>(null);

  // Fetch work days with time entries
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

  // Flatten all entries for weekly calendar
  const allEntries = useMemo(() => {
    return workDays.flatMap((day) => day.time_entries || []);
  }, [workDays]);

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

  // Calculate totals from work day spans
  const totalSeconds = workDays.reduce((acc, day) => {
    const dayDuration = day.end_time
      ? Math.floor((new Date(day.end_time).getTime() - new Date(day.start_time).getTime()) / 1000)
      : Math.floor((Date.now() - new Date(day.start_time).getTime()) / 1000);
    return acc + dayDuration;
  }, 0);

  // Calculate totals by entry type
  const entryTypeTotals = useMemo(() => {
    const totals: Record<TimeEntryType, number> = {
      property: 0,
      travel: 0,
      break: 0,
    };

    allEntries.forEach((entry) => {
      const start = new Date(entry.start_time).getTime();
      const end = entry.end_time ? new Date(entry.end_time).getTime() : Date.now();
      const seconds = Math.floor((end - start) / 1000);
      const entryType = entry.entry_type || 'property';
      totals[entryType] += seconds;
    });

    return totals;
  }, [allEntries]);

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
      <PullToRefresh onRefresh={async () => { await refetch(); }}>
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
        <div className="bg-primary-50 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-primary-700">Gesamtzeit</span>
            <span className="text-lg font-semibold text-primary-900">
              {swissFormat.durationHuman(totalSeconds)}
            </span>
          </div>

          {/* Entry type breakdown */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            {(Object.keys(ENTRY_TYPE_CONFIG) as TimeEntryType[]).map((type) => {
              const config = ENTRY_TYPE_CONFIG[type];
              const Icon = config.icon;
              const seconds = entryTypeTotals[type];

              return (
                <div
                  key={type}
                  className="flex items-center gap-1.5 bg-white/50 rounded px-2 py-1"
                >
                  <Icon className={cn('h-3 w-3', config.color)} />
                  <span className="text-gray-600 truncate">{config.label}</span>
                  <span className="font-medium ml-auto">
                    {swissFormat.durationHuman(seconds)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Content based on view mode */}
        {viewMode === 'week' ? (
          /* Weekly Calendar View */
          allEntries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Keine Einträge für diese Woche</p>
            </div>
          ) : (
            <WeeklyCalendar
              entries={allEntries}
              selectedDate={selectedDate}
              className="mb-6"
            />
          )
        ) : (
          /* Day View - Work days list */
          workDays.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Keine Einträge für diesen Tag</p>
            </div>
          ) : (
            <div className="space-y-4">
              {workDays.map((day) => (
                <div key={day.id}>
                  <WorkDayCard
                    workDay={day}
                    entries={day.time_entries}
                    isActive={!day.end_time}
                    onClick={() => setSelectedWorkDay(day)}
                    className="mb-2"
                  />
                  {day.time_entries.length > 0 && (
                    <>
                      <PropertyTimeSummary
                        entries={day.time_entries}
                        className="mb-2 ml-4"
                      />
                      <TimeEntryList
                        entries={day.time_entries}
                        className="ml-4"
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </PullToRefresh>

      {/* Work Day Detail Sheet */}
      <WorkDayDetailSheet
        workDay={selectedWorkDay}
        open={!!selectedWorkDay}
        onOpenChange={(open) => !open && setSelectedWorkDay(null)}
        onEntryUpdated={() => refetch()}
      />
    </PageContainer>
  );
}
