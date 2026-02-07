'use client';

import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Car, Building2, Coffee, MapPin, Clock, FileText, Pencil, Wrench, Trees, Scissors, ClipboardList, Sparkles, Palmtree } from 'lucide-react';
import { cn } from '@/lib/utils';
import { swissFormat } from '@/lib/i18n';
import type { TimeEntryWithProperty, TimeEntryType, ActivityType } from '@/types/database';
import { TimeEntryEditSheet } from './time-entry-edit-sheet';
import { MergedEntryEditSheet } from './merged-entry-edit-sheet';

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
  vacation: {
    bg: 'bg-green-50',
    border: 'border-green-300',
    text: 'text-green-800',
    icon: 'text-green-600',
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
  notes: string | null;
  top: number;
  height: number;
  column: number;
  totalColumns: number;
}

export function DailyCalendar({ entries, selectedDate, className, onEntryUpdated }: DailyCalendarProps) {
  const [selectedEntry, setSelectedEntry] = useState<TimeEntryWithProperty | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [selectedMergedEntry, setSelectedMergedEntry] = useState<MergedCalendarEntry | null>(null);
  const [mergedSheetOpen, setMergedSheetOpen] = useState(false);

  // Type guard to check if entry is merged
  const isMergedEntry = (entry: TimeEntryWithProperty | MergedCalendarEntry): entry is MergedCalendarEntry => {
    return 'entries' in entry && Array.isArray(entry.entries);
  };

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
            if (entry.notes) {
              currentMerged.notes = currentMerged.notes
                ? `${currentMerged.notes}\n${entry.notes}`
                : entry.notes;
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
          notes: entry.notes || null,
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

  // Calculate entry dimensions with visual collision detection
  const entriesWithLayout = useMemo(() => {
    // First merge consecutive property entries
    const mergedEntries = mergeConsecutivePropertyEntries(entries);

    // First pass: calculate basic dimensions and sort by start time
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
      case 'vacation':
        return 'Ferien';
      case 'property':
      default:
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
      case 'vacation':
        return <Palmtree className={cn('h-4 w-4', colors.icon)} />;
      case 'property':
      default:
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
  const calculateDuration = (entry: TimeEntryWithProperty | MergedCalendarEntry): number => {
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
              const merged = isMergedEntry(entry);

              // Determine layout based on height
              const isTiny = entry.height < 30;
              const isCompact = entry.height < 60;
              const isMediumEntry = entry.height >= 80;
              const isLargeEntry = entry.height >= 110;
              const isOverlapping = entry.totalColumns > 1;

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
              const getActivityIcons = (size: 'sm' | 'md' = 'md') => {
                if (!merged) return null;
                return Array.from(entry.activities).map(actType => {
                  const config = ACTIVITY_ICONS[actType];
                  const Icon = config.icon;
                  const sizeClass = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
                  return <Icon key={actType} className={cn(sizeClass, config.color)} />;
                });
              };

              return (
                <button
                  key={entry.id}
                  onClick={handleClick}
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
                    // Tiny single-line layout (minimal) - property icon first, then activity icons
                    <div className={cn('flex items-center gap-1 h-full text-xs', colors.text)}>
                      {/* Always show entry type icon first */}
                      {getEntryIcon(entry.entry_type || 'property')}
                      {/* Show property name if space allows */}
                      <span className={cn('font-medium truncate flex-1', isOverlapping && 'hidden sm:inline')}>
                        {entry.property?.name || getEntryTypeLabel(entry.entry_type || 'property')}
                      </span>
                      {/* Activity icons after property name */}
                      {entry.entry_type === 'property' && (
                        <span className={cn('flex items-center gap-0.5 shrink-0', isOverlapping && 'hidden sm:flex')}>
                          {merged ? getActivityIcons('sm') : (
                            (entry as TimeEntryWithProperty).activity_type &&
                            getActivityIcon((entry as TimeEntryWithProperty).activity_type, 'sm')
                          )}
                        </span>
                      )}
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
                    // Compact single-line layout - property icon first, then name, then activity icons
                    <div className={cn('flex items-center gap-1.5 h-full text-sm', colors.text)}>
                      {/* Always show entry type icon first */}
                      {getEntryIcon(entry.entry_type || 'property')}
                      {/* Property name */}
                      <span className={cn('font-semibold truncate flex-1', isOverlapping && 'hidden sm:inline')}>
                        {entry.property?.name || getEntryTypeLabel(entry.entry_type || 'property')}
                      </span>
                      {/* Activity icons after property name */}
                      {entry.entry_type === 'property' && (
                        <span className={cn('flex items-center gap-0.5 shrink-0', isOverlapping && 'hidden sm:flex')}>
                          {merged ? getActivityIcons() : (
                            (entry as TimeEntryWithProperty).activity_type &&
                            getActivityIcon((entry as TimeEntryWithProperty).activity_type)
                          )}
                        </span>
                      )}
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
                          {merged ? (
                            <span className="flex items-center gap-0.5">
                              {getActivityIcons()}
                            </span>
                          ) : (
                            (entry as TimeEntryWithProperty).activity_type && getActivityIcon((entry as TimeEntryWithProperty).activity_type)
                          )}
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
