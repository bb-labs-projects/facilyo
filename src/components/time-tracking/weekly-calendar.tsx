'use client';

import { useMemo, useState } from 'react';
import { format, startOfWeek, addDays, isSameDay, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Car, Building2, Coffee, Wrench, Trees, Scissors, ClipboardList, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TimeEntryWithProperty, TimeEntryType, ActivityType } from '@/types/database';
import { TimeEntryEditSheet } from './time-entry-edit-sheet';
import { MergedEntryEditSheet } from './merged-entry-edit-sheet';

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
const HOUR_HEIGHT = 75; // pixels per hour
const MIN_ENTRY_HEIGHT = 18; // minimum height for readable text

// Entry type colors matching the design
const ENTRY_COLORS: Record<TimeEntryType, { bg: string; border: string; text: string }> = {
  property: {
    bg: 'bg-primary-100',
    border: 'border-primary-300',
    text: 'text-primary-800',
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

// Activity type icons
const ACTIVITY_ICONS: Record<ActivityType, { icon: typeof Wrench; color: string }> = {
  hauswartung: { icon: Wrench, color: 'text-blue-600' },
  rasen_maehen: { icon: Trees, color: 'text-green-600' },
  hecken_schneiden: { icon: Scissors, color: 'text-emerald-600' },
  regie: { icon: ClipboardList, color: 'text-purple-600' },
  reinigung: { icon: Sparkles, color: 'text-cyan-600' },
};

interface CalendarEntry extends TimeEntryWithProperty {
  top: number;
  height: number;
  column: number;
  totalColumns: number;
}

// Merged entry for displaying grouped property entries
interface MergedCalendarEntry {
  id: string;
  property_id: string | null;
  property: TimeEntryWithProperty['property'];
  entry_type: TimeEntryType;
  start_time: string;
  end_time: string | null;
  entries: TimeEntryWithProperty[]; // Original entries that were merged
  activities: Set<ActivityType>;
  top: number;
  height: number;
  column: number;
  totalColumns: number;
}

export function WeeklyCalendar({ entries, selectedDate, className, onEntryUpdated }: WeeklyCalendarProps) {
  const [selectedEntry, setSelectedEntry] = useState<TimeEntryWithProperty | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [selectedMergedEntry, setSelectedMergedEntry] = useState<MergedCalendarEntry | null>(null);
  const [mergedSheetOpen, setMergedSheetOpen] = useState(false);

  const handleEntryClick = (entry: TimeEntryWithProperty) => {
    setSelectedEntry(entry);
    setEditSheetOpen(true);
  };

  const handleMergedEntryClick = (merged: MergedCalendarEntry) => {
    setSelectedMergedEntry(merged);
    setMergedSheetOpen(true);
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

  // Merge consecutive property entries on the same property
  const mergeConsecutivePropertyEntries = (dayEntries: TimeEntryWithProperty[]): (TimeEntryWithProperty | MergedCalendarEntry)[] => {
    // Sort entries by start time
    const sorted = [...dayEntries].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

    const result: (TimeEntryWithProperty | MergedCalendarEntry)[] = [];
    let currentMerged: MergedCalendarEntry | null = null;

    for (const entry of sorted) {
      // Only merge property entries with the same property_id
      if (entry.entry_type === 'property' && entry.property_id) {
        if (currentMerged &&
            currentMerged.property_id === entry.property_id &&
            currentMerged.entry_type === 'property') {
          // Check if this entry is consecutive (within 1 minute gap)
          const lastEndTime = currentMerged.end_time
            ? new Date(currentMerged.end_time).getTime()
            : Date.now();
          const thisStartTime = new Date(entry.start_time).getTime();
          const gap = thisStartTime - lastEndTime;

          if (gap <= 60000) { // Within 1 minute = consecutive
            // Merge into current
            currentMerged.end_time = entry.end_time;
            currentMerged.entries.push(entry);
            if (entry.activity_type) {
              currentMerged.activities.add(entry.activity_type);
            }
            continue;
          }
        }

        // Start a new merged entry
        if (currentMerged) {
          result.push(currentMerged);
        }

        currentMerged = {
          id: `merged-${entry.id}`,
          property_id: entry.property_id,
          property: entry.property,
          entry_type: 'property',
          start_time: entry.start_time,
          end_time: entry.end_time,
          entries: [entry],
          activities: new Set(entry.activity_type ? [entry.activity_type] : []),
          top: 0,
          height: 0,
          column: 0,
          totalColumns: 1,
        };
      } else {
        // Non-property entry or no property_id - push as is
        if (currentMerged) {
          result.push(currentMerged);
          currentMerged = null;
        }
        result.push(entry);
      }
    }

    // Don't forget the last merged entry
    if (currentMerged) {
      result.push(currentMerged);
    }

    return result;
  };

  // Type guard to check if entry is merged
  const isMergedEntry = (entry: TimeEntryWithProperty | MergedCalendarEntry): entry is MergedCalendarEntry => {
    return 'entries' in entry && Array.isArray(entry.entries);
  };

  // Calculate entry dimensions with collision detection for a day's entries
  const calculateEntriesWithLayout = (dayEntries: TimeEntryWithProperty[]): (CalendarEntry | MergedCalendarEntry)[] => {
    // First merge consecutive property entries
    const mergedEntries = mergeConsecutivePropertyEntries(dayEntries);

    // First pass: calculate basic dimensions
    const withDimensions = mergedEntries.map((entry) => {
      const startDate = new Date(entry.start_time);
      const endDate = entry.end_time ? new Date(entry.end_time) : new Date();

      const startHour = Math.max(startDate.getHours() + startDate.getMinutes() / 60, START_HOUR);
      const endHour = Math.min(endDate.getHours() + endDate.getMinutes() / 60, END_HOUR);

      const top = (startHour - START_HOUR) * HOUR_HEIGHT;
      const calculatedHeight = (endHour - startHour) * HOUR_HEIGHT;
      const height = Math.max(calculatedHeight, MIN_ENTRY_HEIGHT);

      if (isMergedEntry(entry)) {
        return { ...entry, top, height, column: 0, totalColumns: 1, startTimestamp: startDate.getTime() };
      }
      return { ...entry, top, height, column: 0, totalColumns: 1, startTimestamp: startDate.getTime() } as CalendarEntry & { startTimestamp: number };
    });

    // Sort by start time (chronologically - earliest first)
    withDimensions.sort((a, b) => a.startTimestamp - b.startTimestamp);

    // Second pass: assign columns chronologically (earliest = leftmost)
    for (let i = 0; i < withDimensions.length; i++) {
      const current = withDimensions[i];

      // Find which columns are taken by visually overlapping earlier entries
      const usedColumns = new Set<number>();

      for (let j = 0; j < i; j++) {
        const prev = withDimensions[j];
        const prevBottom = prev.top + prev.height;
        const currentBottom = current.top + current.height;
        const overlaps = !(current.top >= prevBottom || prev.top >= currentBottom);

        if (overlaps) {
          usedColumns.add(prev.column);
        }
      }

      // Assign first available column
      let col = 0;
      while (usedColumns.has(col)) col++;
      current.column = col;
    }

    // Third pass: calculate totalColumns for each entry
    for (let i = 0; i < withDimensions.length; i++) {
      const current = withDimensions[i];
      let maxColumn = current.column;

      for (let j = 0; j < withDimensions.length; j++) {
        if (i === j) continue;
        const other = withDimensions[j];

        const currentBottom = current.top + current.height;
        const otherBottom = other.top + other.height;
        const overlaps = !(current.top >= otherBottom || other.top >= currentBottom);

        if (overlaps) {
          maxColumn = Math.max(maxColumn, other.column);
        }
      }

      current.totalColumns = maxColumn + 1;
    }

    // Fourth pass: ensure all overlapping entries have same totalColumns
    for (let i = 0; i < withDimensions.length; i++) {
      const current = withDimensions[i];
      for (let j = 0; j < withDimensions.length; j++) {
        if (i === j) continue;
        const other = withDimensions[j];

        const currentBottom = current.top + current.height;
        const otherBottom = other.top + other.height;
        const overlaps = !(current.top >= otherBottom || other.top >= currentBottom);

        if (overlaps) {
          const maxCols = Math.max(current.totalColumns, other.totalColumns);
          current.totalColumns = maxCols;
          other.totalColumns = maxCols;
        }
      }
    }

    return withDimensions;
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

  // Get activity icon for property entries
  const getActivityIcon = (activityType: ActivityType | null) => {
    if (!activityType) return null;
    const config = ACTIVITY_ICONS[activityType];
    const ActivityIcon = config.icon;
    return <ActivityIcon className={cn('h-3 w-3', config.color)} />;
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
                  {calculateEntriesWithLayout(dayEntries).map((entry) => {
                    const colors = ENTRY_COLORS[entry.entry_type || 'property'];
                    const startTime = format(parseISO(entry.start_time), 'HH:mm');
                    const endTime = entry.end_time
                      ? format(parseISO(entry.end_time), 'HH:mm')
                      : null;
                    const isActive = !entry.end_time;
                    const isTiny = entry.height < 25;
                    const isOverlapping = entry.totalColumns > 1;
                    const merged = isMergedEntry(entry);

                    // Calculate horizontal position based on columns
                    const columnWidth = 100 / entry.totalColumns;
                    const leftPercent = entry.column * columnWidth;

                    // For merged entries, open the merged sheet; for regular entries, open edit sheet
                    const handleClick = () => {
                      if (merged) {
                        handleMergedEntryClick(entry);
                      } else {
                        handleEntryClick(entry as TimeEntryWithProperty);
                      }
                    };

                    // Get activity icons for merged entries
                    const activityIcons = merged
                      ? Array.from(entry.activities).map(actType => {
                          const config = ACTIVITY_ICONS[actType];
                          const Icon = config.icon;
                          return <Icon key={actType} className={cn('h-3 w-3', config.color)} />;
                        })
                      : null;

                    return (
                      <button
                        key={entry.id}
                        onClick={handleClick}
                        className={cn(
                          'absolute rounded overflow-hidden',
                          'text-left transition-all hover:shadow-md cursor-pointer hover:z-20',
                          'border',
                          isTiny ? 'px-0.5' : 'px-1 py-0.5',
                          colors.bg,
                          colors.border,
                          colors.text
                        )}
                        style={{
                          top: entry.top,
                          height: entry.height,
                          left: `calc(${leftPercent}% + 2px)`,
                          width: `calc(${columnWidth}% - 4px)`,
                        }}
                      >
                        {/* Single line layout - always fit on one line */}
                        <div className={cn(
                          'flex items-center gap-0.5 h-full whitespace-nowrap',
                          isTiny ? 'text-[10px]' : 'text-xs',
                          isOverlapping && 'justify-center'
                        )}>
                          {/* Always show entry type icon first */}
                          {getEntryIcon(entry.entry_type || 'property')}
                          {/* Hide text and time when overlapping - only show icons */}
                          {!isOverlapping && (
                            <>
                              <span className="truncate flex-1 min-w-0 font-medium">
                                {entry.property?.name || getEntryTypeLabel(entry.entry_type || 'property')}
                              </span>
                              {/* Activity icons after property name */}
                              {entry.entry_type === 'property' && (
                                <span className="flex items-center gap-0.5 shrink-0">
                                  {merged ? activityIcons : (
                                    (entry as TimeEntryWithProperty).activity_type &&
                                    getActivityIcon((entry as TimeEntryWithProperty).activity_type)
                                  )}
                                </span>
                              )}
                              <span className="text-[10px] opacity-75 shrink-0 flex items-center gap-0.5">
                                {startTime}-{endTime || ''}
                                {isActive && (
                                  <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                                  </span>
                                )}
                              </span>
                            </>
                          )}
                          {/* When overlapping, show activity icons after entry type icon */}
                          {isOverlapping && entry.entry_type === 'property' && (
                            <span className="flex items-center gap-0.5">
                              {merged ? activityIcons : (
                                (entry as TimeEntryWithProperty).activity_type &&
                                getActivityIcon((entry as TimeEntryWithProperty).activity_type)
                              )}
                            </span>
                          )}
                          {isOverlapping && isActive && (
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
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

      {/* Edit Sheet for single entries */}
      <TimeEntryEditSheet
        entry={selectedEntry}
        open={editSheetOpen}
        onOpenChange={(open) => {
          if (!open) handleEditSheetClose();
        }}
        onSaved={handleEntrySaved}
        onDeleted={handleEntryDeleted}
      />

      {/* Edit Sheet for merged entries */}
      {selectedMergedEntry && (
        <MergedEntryEditSheet
          entries={selectedMergedEntry.entries}
          propertyName={selectedMergedEntry.property?.name || 'Liegenschaft'}
          open={mergedSheetOpen}
          onOpenChange={(open) => {
            if (!open) {
              setMergedSheetOpen(false);
              setSelectedMergedEntry(null);
            }
          }}
          onEntryUpdated={() => {
            setMergedSheetOpen(false);
            setSelectedMergedEntry(null);
            onEntryUpdated?.();
          }}
        />
      )}
    </>
  );
}
