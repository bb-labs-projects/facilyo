'use client';

import { useMemo, useState } from 'react';
import { format, startOfWeek, addDays, isSameDay, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Car, Building2, Coffee, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TimeEntryWithProperty, TimeEntryType } from '@/types/database';
import { TimeEntryEditSheet } from './time-entry-edit-sheet';

interface WeeklyCalendarProps {
  entries: TimeEntryWithProperty[];
  selectedDate: Date;
  className?: string;
  onEntryUpdated?: () => void;
}

// Time range for the calendar (5:00 - 24:00)
const START_HOUR = 5;
const END_HOUR = 24;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
const HOUR_HEIGHT = 50; // pixels per hour
const MIN_ENTRY_HEIGHT = 18; // minimum height for readable text

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

export function WeeklyCalendar({ entries, selectedDate, className, onEntryUpdated }: WeeklyCalendarProps) {
  const [selectedEntry, setSelectedEntry] = useState<TimeEntryWithProperty | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);

  const handleEntryClick = (entry: TimeEntryWithProperty) => {
    setSelectedEntry(entry);
    setEditSheetOpen(true);
  };

  const handleEditSheetClose = () => {
    setEditSheetOpen(false);
    setSelectedEntry(null);
  };

  const handleEntrySaved = () => {
    setEditSheetOpen(false);
    setSelectedEntry(null);
    onEntryUpdated?.();
  };

  const handleEntryDeleted = () => {
    setEditSheetOpen(false);
    setSelectedEntry(null);
    onEntryUpdated?.();
  };

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

  // Calculate entry dimensions - height matches actual duration
  const calculateEntryDimensions = (entry: TimeEntryWithProperty): CalendarEntry => {
    const startDate = new Date(entry.start_time);
    const endDate = entry.end_time ? new Date(entry.end_time) : new Date();

    // Clamp to display range
    const startHour = Math.max(startDate.getHours() + startDate.getMinutes() / 60, START_HOUR);
    const endHour = Math.min(endDate.getHours() + endDate.getMinutes() / 60, END_HOUR);

    const top = (startHour - START_HOUR) * HOUR_HEIGHT;
    // Use actual time-based height with small minimum for readability
    const calculatedHeight = (endHour - startHour) * HOUR_HEIGHT;
    const height = Math.max(calculatedHeight, MIN_ENTRY_HEIGHT);

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
      <div className={cn('overflow-auto max-h-[60vh] rounded-lg border border-gray-200', className)}>
        <div className="min-w-[800px]">
          {/* Header with days */}
          <div className="flex border-b border-gray-200 sticky top-0 z-10 bg-white">
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
                    const isTiny = dims.height < 25;

                    return (
                      <button
                        key={entry.id}
                        onClick={() => handleEntryClick(entry)}
                        className={cn(
                          'absolute left-0.5 right-0.5 rounded overflow-hidden',
                          'text-left transition-all hover:shadow-md cursor-pointer',
                          'border',
                          isTiny ? 'px-0.5' : 'px-1 py-0.5',
                          colors.bg,
                          colors.border,
                          colors.text
                        )}
                        style={{
                          top: dims.top,
                          height: dims.height,
                        }}
                      >
                        {/* Single line layout - always fit on one line */}
                        <div className={cn(
                          'flex items-center gap-0.5 h-full whitespace-nowrap',
                          isTiny ? 'text-[10px]' : 'text-xs'
                        )}>
                          {!isTiny && getEntryIcon(entry.entry_type || 'property')}
                          <span className="truncate flex-1 min-w-0 font-medium">
                            {entry.property?.name || getEntryTypeLabel(entry.entry_type || 'property')}
                          </span>
                          {!isTiny && (
                            <span className="text-[10px] opacity-75 shrink-0">
                              {startTime}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Edit Sheet */}
      <TimeEntryEditSheet
        entry={selectedEntry}
        open={editSheetOpen}
        onOpenChange={(open) => {
          if (!open) handleEditSheetClose();
        }}
        onSaved={handleEntrySaved}
        onDeleted={handleEntryDeleted}
      />
    </>
  );
}
