'use client';

import { useMemo, useState } from 'react';
import { format, startOfWeek, addDays, isSameDay, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Car, Building2, Coffee } from 'lucide-react';
import { cn } from '@/lib/utils';
import { swissFormat } from '@/lib/i18n';
import type { TimeEntryWithProperty, TimeEntryType } from '@/types/database';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface WeeklyCalendarProps {
  entries: TimeEntryWithProperty[];
  selectedDate: Date;
  className?: string;
}

// Time range for the calendar (6:00 - 21:00)
const START_HOUR = 6;
const END_HOUR = 21;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
const HOUR_HEIGHT = 60; // pixels per hour

// Entry type colors matching the design
const ENTRY_COLORS: Record<TimeEntryType, { bg: string; border: string; text: string }> = {
  property: {
    bg: 'bg-blue-100',
    border: 'border-blue-300',
    text: 'text-blue-800',
  },
  travel: {
    bg: 'bg-amber-100',
    border: 'border-amber-300',
    text: 'text-amber-800',
  },
  break: {
    bg: 'bg-orange-100',
    border: 'border-orange-300',
    text: 'text-orange-800',
  },
};

interface CalendarEntry extends TimeEntryWithProperty {
  top: number;
  height: number;
}

export function WeeklyCalendar({ entries, selectedDate, className }: WeeklyCalendarProps) {
  const [selectedEntry, setSelectedEntry] = useState<TimeEntryWithProperty | null>(null);

  // Generate week days starting from Monday
  const weekStart = startOfWeek(selectedDate, { locale: de });
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Group entries by day
  const entriesByDay = useMemo(() => {
    const grouped = new Map<string, TimeEntryWithProperty[]>();

    weekDays.forEach((day) => {
      const dayKey = format(day, 'yyyy-MM-dd');
      grouped.set(dayKey, []);
    });

    entries.forEach((entry) => {
      const entryDate = format(parseISO(entry.start_time), 'yyyy-MM-dd');
      const existing = grouped.get(entryDate);
      if (existing) {
        existing.push(entry);
      }
    });

    return grouped;
  }, [entries, weekDays]);

  // Calculate total hours per day
  const hoursPerDay = useMemo(() => {
    const hours = new Map<string, number>();

    entriesByDay.forEach((dayEntries, dayKey) => {
      let totalSeconds = 0;
      dayEntries.forEach((entry) => {
        const start = new Date(entry.start_time).getTime();
        const end = entry.end_time
          ? new Date(entry.end_time).getTime()
          : Date.now();
        totalSeconds += Math.floor((end - start) / 1000);
      });
      hours.set(dayKey, totalSeconds / 3600);
    });

    return hours;
  }, [entriesByDay]);

  // Convert time to position
  const timeToPosition = (timeString: string): number => {
    const date = new Date(timeString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const totalMinutes = (hours - START_HOUR) * 60 + minutes;
    return (totalMinutes / 60) * HOUR_HEIGHT;
  };

  // Calculate entry dimensions
  const calculateEntryDimensions = (entry: TimeEntryWithProperty): CalendarEntry => {
    const startDate = new Date(entry.start_time);
    const endDate = entry.end_time ? new Date(entry.end_time) : new Date();

    // Clamp to display range
    const startHour = Math.max(startDate.getHours() + startDate.getMinutes() / 60, START_HOUR);
    const endHour = Math.min(endDate.getHours() + endDate.getMinutes() / 60, END_HOUR + 1);

    const top = (startHour - START_HOUR) * HOUR_HEIGHT;
    const height = Math.max((endHour - startHour) * HOUR_HEIGHT, 30); // Minimum 30px height

    return { ...entry, top, height };
  };

  // Get entry type label
  const getEntryTypeLabel = (type: TimeEntryType): string => {
    switch (type) {
      case 'travel':
        return 'Fahrzeit';
      case 'break':
        return 'Pause';
      case 'property':
        return 'Liegenschaft';
    }
  };

  // Get entry type icon
  const getEntryIcon = (type: TimeEntryType) => {
    switch (type) {
      case 'travel':
        return <Car className="h-3 w-3" />;
      case 'break':
        return <Coffee className="h-3 w-3" />;
      case 'property':
        return <Building2 className="h-3 w-3" />;
    }
  };

  const totalCalendarHeight = HOURS.length * HOUR_HEIGHT;

  return (
    <>
      <div className={cn('overflow-x-auto', className)}>
        <div className="min-w-[800px]">
          {/* Header with days */}
          <div className="flex border-b border-gray-200">
            {/* Time column header */}
            <div className="w-16 shrink-0 px-2 py-3 text-xs font-medium text-gray-500">
              Zeit
            </div>
            {/* Day headers */}
            {weekDays.map((day) => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const isToday = isSameDay(day, new Date());
              const totalHours = hoursPerDay.get(dayKey) || 0;

              return (
                <div
                  key={dayKey}
                  className={cn(
                    'flex-1 px-2 py-3 text-center border-l border-gray-200',
                    isToday && 'bg-primary-50'
                  )}
                >
                  <div className={cn(
                    'font-medium',
                    isToday ? 'text-primary-600' : 'text-gray-900'
                  )}>
                    {format(day, 'EEE, d. MMM', { locale: de })}
                  </div>
                  {totalHours > 0 && (
                    <div className="text-xs text-primary-600 mt-1">
                      {totalHours.toFixed(1)}h Arbeit
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Calendar body */}
          <div className="flex relative" style={{ height: totalCalendarHeight }}>
            {/* Time column */}
            <div className="w-16 shrink-0 relative">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 px-2 text-xs text-gray-500 -translate-y-1/2"
                  style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
                >
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day) => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const dayEntries = entriesByDay.get(dayKey) || [];
              const isToday = isSameDay(day, new Date());

              return (
                <div
                  key={dayKey}
                  className={cn(
                    'flex-1 relative border-l border-gray-200',
                    isToday && 'bg-primary-50/30'
                  )}
                >
                  {/* Hour grid lines */}
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 border-t border-gray-100"
                      style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
                    />
                  ))}

                  {/* Entries */}
                  {dayEntries.map((entry) => {
                    const dims = calculateEntryDimensions(entry);
                    const colors = ENTRY_COLORS[entry.entry_type || 'property'];
                    const startTime = format(parseISO(entry.start_time), 'HH:mm');
                    const endTime = entry.end_time
                      ? format(parseISO(entry.end_time), 'HH:mm')
                      : 'Aktiv';

                    return (
                      <button
                        key={entry.id}
                        onClick={() => setSelectedEntry(entry)}
                        className={cn(
                          'absolute left-1 right-1 rounded-md border p-1 overflow-hidden',
                          'text-left transition-all hover:shadow-md cursor-pointer',
                          colors.bg,
                          colors.border,
                          colors.text
                        )}
                        style={{
                          top: dims.top,
                          height: dims.height,
                        }}
                      >
                        <div className="flex items-center gap-1 text-xs font-medium truncate">
                          {getEntryIcon(entry.entry_type || 'property')}
                          <span className="truncate">
                            {entry.property?.name || getEntryTypeLabel(entry.entry_type || 'property')}
                          </span>
                        </div>
                        {dims.height > 40 && (
                          <div className="text-[10px] opacity-75 mt-0.5">
                            {startTime}-{endTime}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Entry Detail Sheet */}
      <Sheet open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {selectedEntry?.property?.name || getEntryTypeLabel(selectedEntry?.entry_type || 'property')}
            </SheetTitle>
          </SheetHeader>

          {selectedEntry && (
            <div className="mt-6 space-y-4">
              {/* Entry Type Badge */}
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
                    ENTRY_COLORS[selectedEntry.entry_type || 'property'].bg,
                    ENTRY_COLORS[selectedEntry.entry_type || 'property'].text
                  )}
                >
                  {getEntryIcon(selectedEntry.entry_type || 'property')}
                  {getEntryTypeLabel(selectedEntry.entry_type || 'property')}
                </div>
              </div>

              {/* Time Details */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Datum</span>
                  <span className="font-medium">
                    {format(parseISO(selectedEntry.start_time), 'EEEE, d. MMMM yyyy', { locale: de })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Start</span>
                  <span className="font-mono">
                    {format(parseISO(selectedEntry.start_time), 'HH:mm')}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Ende</span>
                  <span className="font-mono">
                    {selectedEntry.end_time
                      ? format(parseISO(selectedEntry.end_time), 'HH:mm')
                      : 'Aktiv'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Dauer</span>
                  <span className="font-mono font-semibold">
                    {swissFormat.durationHuman(
                      Math.floor(
                        ((selectedEntry.end_time
                          ? new Date(selectedEntry.end_time).getTime()
                          : Date.now()) -
                          new Date(selectedEntry.start_time).getTime()) /
                          1000
                      )
                    )}
                  </span>
                </div>
              </div>

              {/* Property Details (if applicable) */}
              {selectedEntry.property && (
                <div className="pt-4 border-t space-y-2">
                  <h4 className="text-sm font-medium">Liegenschaft</h4>
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">{selectedEntry.property.name}</p>
                    <p>{selectedEntry.property.address}</p>
                    <p>
                      {selectedEntry.property.postal_code} {selectedEntry.property.city}
                    </p>
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedEntry.notes && (
                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium mb-2">Notizen</h4>
                  <p className="text-sm text-muted-foreground">{selectedEntry.notes}</p>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
