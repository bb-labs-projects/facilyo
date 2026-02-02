'use client';

import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Car, Building2, Coffee, MapPin, Clock, FileText, Pencil, Wrench, Trees, Scissors, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { swissFormat } from '@/lib/i18n';
import type { TimeEntryWithProperty, TimeEntryType, ActivityType } from '@/types/database';
import { TimeEntryEditSheet } from './time-entry-edit-sheet';

interface DailyCalendarProps {
  entries: TimeEntryWithProperty[];
  selectedDate: Date;
  className?: string;
  onEntryUpdated?: () => void;
}

// Time range for the calendar (5:00 - 24:00)
const START_HOUR = 5;
const END_HOUR = 24;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
const HOUR_HEIGHT = 90; // pixels per hour
const MIN_ENTRY_HEIGHT = 22; // minimum height for readable text (single line)

// Entry type colors matching the design
const ENTRY_COLORS: Record<TimeEntryType, { bg: string; border: string; text: string; icon: string }> = {
  property: {
    bg: 'bg-primary-50',
    border: 'border-primary-300',
    text: 'text-primary-800',
    icon: 'text-primary-900',
  },
  travel: {
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    text: 'text-amber-800',
    icon: 'text-amber-600',
  },
  break: {
    bg: 'bg-orange-50',
    border: 'border-orange-300',
    text: 'text-orange-800',
    icon: 'text-orange-600',
  },
};

// Activity type icons
const ACTIVITY_ICONS: Record<ActivityType, { icon: typeof Wrench; color: string }> = {
  hauswartung: { icon: Wrench, color: 'text-blue-600' },
  rasen_maehen: { icon: Trees, color: 'text-green-600' },
  hecken_schneiden: { icon: Scissors, color: 'text-emerald-600' },
  regie: { icon: ClipboardList, color: 'text-purple-600' },
};

interface CalendarEntry extends TimeEntryWithProperty {
  top: number;
  height: number;
  column: number;
  totalColumns: number;
}

export function DailyCalendar({ entries, selectedDate, className, onEntryUpdated }: DailyCalendarProps) {
  const [selectedEntry, setSelectedEntry] = useState<TimeEntryWithProperty | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);

  // Calculate entry dimensions with visual collision detection
  const entriesWithLayout = useMemo(() => {
    // First pass: calculate basic dimensions and sort by start time
    const withDimensions = entries.map((entry) => {
      const startDate = new Date(entry.start_time);
      const endDate = entry.end_time ? new Date(entry.end_time) : new Date();

      const startHour = Math.max(startDate.getHours() + startDate.getMinutes() / 60, START_HOUR);
      const endHour = Math.min(endDate.getHours() + endDate.getMinutes() / 60, END_HOUR);

      const top = (startHour - START_HOUR) * HOUR_HEIGHT;
      const calculatedHeight = (endHour - startHour) * HOUR_HEIGHT;
      const height = Math.max(calculatedHeight, MIN_ENTRY_HEIGHT);

      return { ...entry, top, height, column: 0, totalColumns: 1, startTimestamp: startDate.getTime() };
    });

    // Sort by start time (chronologically)
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

      // Assign first available column (earliest entries get lower column numbers = left)
      let col = 0;
      while (usedColumns.has(col)) col++;
      current.column = col;
    }

    // Third pass: calculate totalColumns for each entry based on all overlapping entries
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
  }, [entries]);

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
    const colors = ENTRY_COLORS[type];
    switch (type) {
      case 'travel':
        return <Car className={cn('h-4 w-4', colors.icon)} />;
      case 'break':
        return <Coffee className={cn('h-4 w-4', colors.icon)} />;
      case 'property':
        return <Building2 className={cn('h-4 w-4', colors.icon)} />;
    }
  };

  // Get activity icon for property entries
  const getActivityIcon = (activityType: ActivityType | null, size: 'sm' | 'md' = 'md') => {
    if (!activityType) return null;
    const config = ACTIVITY_ICONS[activityType];
    const ActivityIcon = config.icon;
    const sizeClass = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
    return <ActivityIcon className={cn(sizeClass, config.color)} />;
  };

  // Calculate duration
  const calculateDuration = (entry: TimeEntryWithProperty): number => {
    const start = new Date(entry.start_time).getTime();
    const end = entry.end_time ? new Date(entry.end_time).getTime() : Date.now();
    return Math.floor((end - start) / 1000);
  };

  const totalCalendarHeight = HOURS.length * HOUR_HEIGHT;

  // Calculate total hours for the day
  const totalHours = useMemo(() => {
    let totalSeconds = 0;
    entries.forEach((entry) => {
      totalSeconds += calculateDuration(entry);
    });
    return totalSeconds / 3600;
  }, [entries]);

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

  return (
    <>
      <div className={cn('rounded-lg border border-gray-200 bg-white', className)}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 sticky top-0 z-20">
          <div className="font-medium text-gray-900">
            {format(selectedDate, 'EEEE, d. MMMM yyyy', { locale: de })}
          </div>
          {totalHours > 0 && (
            <div className="text-sm text-primary-600 font-medium">
              {totalHours.toFixed(1)}h Gesamtzeit
            </div>
          )}
        </div>

        {/* Calendar body - scrollable */}
        <div className="overflow-y-auto max-h-[60vh]">
          <div className="flex relative" style={{ height: totalCalendarHeight }}>
          {/* Time column */}
          <div className="w-16 shrink-0 relative border-r border-gray-200 bg-gray-50/50">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 px-2 text-xs text-gray-500 -translate-y-1/2 font-medium"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
              >
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day column */}
          <div className="flex-1 relative">
            {/* Hour grid lines */}
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-t border-gray-100"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
              />
            ))}

            {/* Half-hour grid lines */}
            {HOURS.slice(0, -1).map((hour) => (
              <div
                key={`half-${hour}`}
                className="absolute left-0 right-0 border-t border-gray-50"
                style={{ top: (hour - START_HOUR + 0.5) * HOUR_HEIGHT }}
              />
            ))}

            {/* Current time indicator */}
            {(() => {
              const now = new Date();
              const currentHour = now.getHours() + now.getMinutes() / 60;
              if (currentHour >= START_HOUR && currentHour <= END_HOUR) {
                const top = (currentHour - START_HOUR) * HOUR_HEIGHT;
                return (
                  <div
                    className="absolute left-0 right-0 z-10 flex items-center"
                    style={{ top }}
                  >
                    <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                    <div className="flex-1 h-0.5 bg-red-500" />
                  </div>
                );
              }
              return null;
            })()}

            {/* Entries */}
            {entriesWithLayout.map((entry) => {
              const colors = ENTRY_COLORS[entry.entry_type || 'property'];
              const startTime = format(parseISO(entry.start_time), 'HH:mm');
              const endTime = entry.end_time
                ? format(parseISO(entry.end_time), 'HH:mm')
                : null;
              const isActive = !entry.end_time;
              const duration = calculateDuration(entry);

              // Determine layout based on height
              const isTiny = entry.height < 30;
              const isCompact = entry.height < 60;
              const isMediumEntry = entry.height >= 80;
              const isLargeEntry = entry.height >= 110;
              const isOverlapping = entry.totalColumns > 1;

              // Calculate horizontal position based on columns
              const columnWidth = 100 / entry.totalColumns;
              const leftPercent = entry.column * columnWidth;

              return (
                <button
                  key={entry.id}
                  onClick={() => handleEntryClick(entry)}
                  className={cn(
                    'absolute rounded-lg border overflow-hidden',
                    'text-left transition-all hover:shadow-md cursor-pointer hover:z-20',
                    'active:scale-[0.99]',
                    isTiny ? 'px-1.5 py-0 border' : isCompact ? 'px-2 py-0.5 border' : 'p-2 border-2',
                    colors.bg,
                    colors.border
                  )}
                  style={{
                    top: entry.top,
                    height: entry.height,
                    left: `calc(${leftPercent}% + 8px)`,
                    width: `calc(${columnWidth}% - 16px)`,
                  }}
                >
                  {isTiny ? (
                    // Tiny single-line layout (minimal)
                    <div className={cn('flex items-center gap-1 h-full text-xs', colors.text)}>
                      {entry.activity_type ? getActivityIcon(entry.activity_type, 'sm') : getEntryIcon(entry.entry_type || 'property')}
                      <span className={cn('font-medium truncate flex-1', isOverlapping && 'hidden sm:inline')}>
                        {entry.property?.name || getEntryTypeLabel(entry.entry_type || 'property')}
                      </span>
                      <span className={cn(
                        'font-mono opacity-70 shrink-0 text-[10px] flex items-center gap-1',
                        isOverlapping && 'hidden sm:flex'
                      )}>
                        {startTime}-{endTime || ''}
                        {isActive && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                          </span>
                        )}
                      </span>
                      {isOverlapping && isActive && (
                        <span className="relative flex h-2 w-2 sm:hidden">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                      )}
                    </div>
                  ) : isCompact ? (
                    // Compact single-line layout
                    <div className={cn('flex items-center gap-1.5 h-full text-sm', colors.text)}>
                      {entry.activity_type ? getActivityIcon(entry.activity_type) : getEntryIcon(entry.entry_type || 'property')}
                      <span className={cn('font-semibold truncate flex-1', isOverlapping && 'hidden sm:inline')}>
                        {entry.property?.name || getEntryTypeLabel(entry.entry_type || 'property')}
                      </span>
                      <span className={cn(
                        'text-xs font-mono opacity-80 shrink-0 flex items-center gap-1',
                        isOverlapping && 'hidden sm:flex'
                      )}>
                        {startTime}-{endTime || ''}
                        {isActive && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                          </span>
                        )}
                      </span>
                      {isOverlapping && isActive && (
                        <span className="relative flex h-2 w-2 sm:hidden">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                      )}
                      <Pencil className={cn('h-3 w-3 opacity-50 shrink-0 hidden sm:block', colors.text)} />
                    </div>
                  ) : (
                    // Full layout for larger entries
                    <>
                      {/* Header row */}
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <div className={cn('flex items-center gap-2 font-semibold truncate', colors.text)}>
                          {getEntryIcon(entry.entry_type || 'property')}
                          <span className="truncate">
                            {entry.property?.name || getEntryTypeLabel(entry.entry_type || 'property')}
                          </span>
                          {entry.activity_type && getActivityIcon(entry.activity_type)}
                        </div>
                        <Pencil className={cn('h-3.5 w-3.5 opacity-50 shrink-0', colors.text)} />
                      </div>

                      {/* Time and duration */}
                      <div className={cn('flex items-center gap-2 text-xs', colors.text, 'opacity-80')}>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span className="font-mono flex items-center gap-1">
                            {startTime} - {endTime || ''}
                            {isActive && (
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="font-medium">
                          {swissFormat.durationHuman(duration)}
                        </div>
                      </div>

                      {/* Property address - only show for property entries with enough space */}
                      {isMediumEntry && entry.property && entry.entry_type === 'property' && (
                        <div className={cn('flex items-start gap-1.5 mt-1 text-xs', colors.text, 'opacity-70')}>
                          <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="line-clamp-1">
                            {entry.property.address}, {entry.property.postal_code} {entry.property.city}
                          </span>
                        </div>
                      )}

                      {/* Notes - only show for large entries */}
                      {isLargeEntry && entry.notes && (
                        <div className={cn('flex items-start gap-1.5 mt-1 text-xs', colors.text, 'opacity-70')}>
                          <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="line-clamp-2">{entry.notes}</span>
                        </div>
                      )}

                    </>
                  )}
                </button>
              );
            })}
          </div>
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
