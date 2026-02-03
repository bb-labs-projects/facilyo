'use client';

import { useState } from 'react';
import { Calendar, Clock, MapPin, Car, Coffee, Building2, Trash2, ChevronDown, ChevronUp, Wrench, Trees, Scissors, ClipboardList, Home, Briefcase } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { swissFormat } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { WorkDay, TimeEntryWithProperty, TimeEntryType, ActivityType } from '@/types/database';

// Activity type display configuration
const ACTIVITY_TYPE_CONFIG: Record<ActivityType, {
  label: string;
  icon: typeof Wrench;
  color: string;
}> = {
  hauswartung: { label: 'Hauswartung', icon: Wrench, color: 'text-blue-600' },
  rasen_maehen: { label: 'Rasen mähen', icon: Trees, color: 'text-green-600' },
  hecken_schneiden: { label: 'Hecken schneiden', icon: Scissors, color: 'text-emerald-600' },
  regie: { label: 'Regie', icon: ClipboardList, color: 'text-purple-600' },
  privatunterhalt: { label: 'Privatunterhalt', icon: Home, color: 'text-rose-600' },
  buero: { label: 'Büro', icon: Briefcase, color: 'text-slate-600' },
};

// Entry type display configuration
const ENTRY_TYPE_CONFIG: Record<TimeEntryType, {
  label: string;
  icon: typeof Car;
  bgColor: string;
  borderColor: string;
  textColor: string;
}> = {
  property: {
    label: 'Liegenschaft',
    icon: Building2,
    bgColor: 'bg-primary-50',
    borderColor: 'border-primary-200',
    textColor: 'text-primary-700',
  },
  travel: {
    label: 'Fahrzeit',
    icon: Car,
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    textColor: 'text-amber-700',
  },
  break: {
    label: 'Pause',
    icon: Coffee,
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    textColor: 'text-orange-700',
  },
};

interface WorkDayCardProps {
  workDay: WorkDay;
  entries?: TimeEntryWithProperty[];
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}

export function WorkDayCard({
  workDay,
  entries = [],
  isActive = false,
  onClick,
  className,
}: WorkDayCardProps) {
  // Calculate total work time from work day span (includes travel time)
  const totalSeconds = workDay.end_time
    ? Math.floor((new Date(workDay.end_time).getTime() - new Date(workDay.start_time).getTime()) / 1000)
    : Math.floor((Date.now() - new Date(workDay.start_time).getTime()) / 1000);

  // Count unique properties (only from property entries)
  const uniqueProperties = new Set(
    entries
      .filter(e => e.entry_type === 'property' && e.property_id)
      .map(e => e.property_id)
  ).size;

  return (
    <Card
      interactive={!!onClick}
      onClick={onClick}
      className={cn(
        isActive && 'border-primary-500 bg-primary-50/50',
        className
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {swissFormat.date(workDay.date, 'EEEE, dd. MMMM')}
          </CardTitle>
          {isActive && (
            <span className="badge badge-success">Aktiv</span>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{swissFormat.durationHuman(totalSeconds)}</span>
          </div>

          {uniqueProperties > 0 && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>
                {uniqueProperties} {uniqueProperties === 1 ? 'Liegenschaft' : 'Liegenschaften'}
              </span>
            </div>
          )}
        </div>

        {/* Time range */}
        <div className="mt-2 text-sm">
          <span className="text-muted-foreground">
            {swissFormat.time(workDay.start_time)}
            {workDay.end_time && ` – ${swissFormat.time(workDay.end_time)}`}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

interface TimeEntryCardProps {
  entry: TimeEntryWithProperty;
  onClick?: () => void;
  onDelete?: (entry: TimeEntryWithProperty) => void;
  className?: string;
}

export function TimeEntryCard({
  entry,
  onClick,
  onDelete,
  className,
}: TimeEntryCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isActive = entry.status === 'active';
  const isPaused = entry.status === 'paused';
  const entryType = entry.entry_type || 'property';
  const config = ENTRY_TYPE_CONFIG[entryType];
  const Icon = config.icon;

  // Calculate duration
  const getDuration = () => {
    const start = new Date(entry.start_time).getTime();
    const end = entry.end_time
      ? new Date(entry.end_time).getTime()
      : Date.now();
    const duration = Math.floor((end - start) / 1000);
    return duration - (entry.pause_duration || 0);
  };

  // Get display name
  const getDisplayName = () => {
    if (entryType === 'property' && entry.property) {
      return entry.property.name;
    }
    return config.label;
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    setShowDeleteConfirm(false);
    onDelete?.(entry);
  };

  return (
    <>
      <Card
        interactive={!!onClick}
        onClick={onClick}
        className={cn(
          'border-l-4',
          config.bgColor,
          config.borderColor,
          isActive && 'ring-2 ring-success-300',
          isPaused && 'ring-2 ring-warning-300',
          className
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Icon className={cn('h-4 w-4', config.textColor)} />
                <h3 className="font-medium truncate">{getDisplayName()}</h3>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {swissFormat.time(entry.start_time)}
                {entry.end_time && ` – ${swissFormat.time(entry.end_time)}`}
              </p>
            </div>

            <div className="flex items-start gap-2">
              <div className="flex flex-col items-end">
                <span className="font-mono text-lg font-semibold">
                  {swissFormat.duration(getDuration())}
                </span>
                <span
                  className={cn(
                    'badge mt-1',
                    isActive && 'badge-success',
                    isPaused && 'badge-warning',
                    entry.status === 'completed' && 'badge-info'
                  )}
                >
                  {isActive ? 'Aktiv' : isPaused ? 'Pausiert' : 'Beendet'}
                </span>
              </div>
              {onDelete && !isActive && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDeleteClick}
                  className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Activity type and property address for property entries */}
          {entryType === 'property' && (
            <div className="mt-2 space-y-1">
              {entry.activity_type && (
                <div className="flex items-center gap-1.5">
                  {(() => {
                    const actConfig = ACTIVITY_TYPE_CONFIG[entry.activity_type];
                    const ActivityIcon = actConfig.icon;
                    return (
                      <>
                        <ActivityIcon className={cn('h-3.5 w-3.5', actConfig.color)} />
                        <span className={cn('text-xs font-medium', actConfig.color)}>
                          {actConfig.label}
                        </span>
                      </>
                    );
                  })()}
                </div>
              )}
              {entry.property && (
                <p className="text-xs text-muted-foreground">
                  {entry.property.address}, {entry.property.city}
                </p>
              )}
            </div>
          )}

          {/* Notes preview */}
          {entry.notes && (
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
              {entry.notes}
            </p>
          )}

          {/* Pause duration if any */}
          {entry.pause_duration > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Pause: {swissFormat.durationHuman(entry.pause_duration)}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zeiteintrag löschen</DialogTitle>
            <DialogDescription>
              Möchten Sie diesen Zeiteintrag wirklich löschen?
              <br />
              <span className="font-medium text-foreground">
                {getDisplayName()} ({swissFormat.time(entry.start_time)}
                {entry.end_time && ` – ${swissFormat.time(entry.end_time)}`})
              </span>
              <br />
              Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// List of time entries
interface TimeEntryListProps {
  entries: TimeEntryWithProperty[];
  onEntryClick?: (entry: TimeEntryWithProperty) => void;
  onEntryDelete?: (entry: TimeEntryWithProperty) => void;
  emptyMessage?: string;
  className?: string;
}

export function TimeEntryList({
  entries,
  onEntryClick,
  onEntryDelete,
  emptyMessage = 'Keine Einträge vorhanden',
  className,
}: TimeEntryListProps) {
  if (entries.length === 0) {
    return (
      <div className={cn('text-center py-8 text-muted-foreground', className)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {entries.map((entry) => (
        <TimeEntryCard
          key={entry.id}
          entry={entry}
          onClick={onEntryClick ? () => onEntryClick(entry) : undefined}
          onDelete={onEntryDelete}
        />
      ))}
    </div>
  );
}

// Grouped view by property with activity breakdown
interface PropertyGroupedEntriesProps {
  entries: TimeEntryWithProperty[];
  onEntryDelete?: (entry: TimeEntryWithProperty) => void;
  className?: string;
}

interface PropertyGroup {
  property: TimeEntryWithProperty['property'];
  propertyId: string | null;
  entries: TimeEntryWithProperty[];
  totalSeconds: number;
  activityBreakdown: Map<ActivityType, number>;
}

export function PropertyGroupedEntries({
  entries,
  onEntryDelete,
  className,
}: PropertyGroupedEntriesProps) {
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());

  // Group entries by property
  const propertyGroups = entries.reduce<Map<string, PropertyGroup>>((groups, entry) => {
    // Only group property entries, skip travel and break
    if (entry.entry_type !== 'property') {
      // Create a special group for non-property entries
      const key = entry.entry_type;
      if (!groups.has(key)) {
        groups.set(key, {
          property: null,
          propertyId: null,
          entries: [],
          totalSeconds: 0,
          activityBreakdown: new Map(),
        });
      }
      const group = groups.get(key)!;
      group.entries.push(entry);

      const duration = calculateDuration(entry);
      group.totalSeconds += duration;
      return groups;
    }

    const key = entry.property_id || 'unknown';
    if (!groups.has(key)) {
      groups.set(key, {
        property: entry.property,
        propertyId: entry.property_id,
        entries: [],
        totalSeconds: 0,
        activityBreakdown: new Map(),
      });
    }

    const group = groups.get(key)!;
    group.entries.push(entry);

    const duration = calculateDuration(entry);
    group.totalSeconds += duration;

    // Track activity breakdown
    if (entry.activity_type) {
      const currentDuration = group.activityBreakdown.get(entry.activity_type) || 0;
      group.activityBreakdown.set(entry.activity_type, currentDuration + duration);
    }

    return groups;
  }, new Map());

  const toggleExpanded = (propertyId: string) => {
    setExpandedProperties(prev => {
      const next = new Set(prev);
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
      return next;
    });
  };

  // Sort: property entries first (by total time desc), then travel, then break
  const sortedGroups = Array.from(propertyGroups.entries()).sort((a, b) => {
    const [keyA, groupA] = a;
    const [keyB, groupB] = b;

    // Non-property entries go last
    if (keyA === 'travel' || keyA === 'break') return 1;
    if (keyB === 'travel' || keyB === 'break') return -1;

    // Sort by total time descending
    return groupB.totalSeconds - groupA.totalSeconds;
  });

  if (entries.length === 0) {
    return (
      <div className={cn('text-center py-8 text-muted-foreground', className)}>
        Keine Einträge vorhanden
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {sortedGroups.map(([key, group]) => {
        // Render travel/break entries as simple cards
        if (key === 'travel' || key === 'break') {
          return group.entries.map((entry) => (
            <TimeEntryCard
              key={entry.id}
              entry={entry}
              onDelete={onEntryDelete}
            />
          ));
        }

        const isExpanded = expandedProperties.has(key);
        const hasMultipleActivities = group.activityBreakdown.size > 1;
        const hasActiveEntry = group.entries.some(e => e.status === 'active');

        return (
          <Card
            key={key}
            className={cn(
              'border-l-4',
              ENTRY_TYPE_CONFIG.property.bgColor,
              ENTRY_TYPE_CONFIG.property.borderColor,
              hasActiveEntry && 'ring-2 ring-success-300'
            )}
          >
            <CardContent className="p-4">
              {/* Header with property name and total time */}
              <div
                className="flex items-start justify-between cursor-pointer"
                onClick={() => toggleExpanded(key)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className={cn('h-4 w-4', ENTRY_TYPE_CONFIG.property.textColor)} />
                    <h3 className="font-medium truncate">
                      {group.property?.name || 'Unbekannte Liegenschaft'}
                    </h3>
                  </div>
                  {group.property && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {group.property.address}, {group.property.city}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="font-mono text-lg font-semibold">
                      {swissFormat.duration(group.totalSeconds)}
                    </span>
                    {hasActiveEntry && (
                      <span className="badge badge-success ml-2">Aktiv</span>
                    )}
                  </div>
                  {(hasMultipleActivities || group.entries.length > 1) && (
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* Activity breakdown summary */}
              {group.activityBreakdown.size > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {Array.from(group.activityBreakdown.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([activityType, seconds]) => {
                      const actConfig = ACTIVITY_TYPE_CONFIG[activityType];
                      const ActivityIcon = actConfig.icon;
                      return (
                        <div
                          key={activityType}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/60 border text-xs"
                        >
                          <ActivityIcon className={cn('h-3.5 w-3.5', actConfig.color)} />
                          <span className={cn('font-medium', actConfig.color)}>
                            {actConfig.label}
                          </span>
                          <span className="text-muted-foreground font-mono">
                            {swissFormat.duration(seconds)}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Expanded detail view */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t space-y-2">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Einzelne Einträge ({group.entries.length})
                  </p>
                  {group.entries
                    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                    .map((entry) => {
                      const duration = calculateDuration(entry);
                      const actConfig = entry.activity_type ? ACTIVITY_TYPE_CONFIG[entry.activity_type] : null;
                      const ActivityIcon = actConfig?.icon;

                      return (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/50"
                        >
                          <div className="flex items-center gap-2">
                            {ActivityIcon && (
                              <ActivityIcon className={cn('h-3.5 w-3.5', actConfig?.color)} />
                            )}
                            <div>
                              <span className={cn('text-sm font-medium', actConfig?.color)}>
                                {actConfig?.label || 'Keine Tätigkeit'}
                              </span>
                              <p className="text-xs text-muted-foreground">
                                {swissFormat.time(entry.start_time)}
                                {entry.end_time && ` – ${swissFormat.time(entry.end_time)}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">
                              {swissFormat.duration(duration)}
                            </span>
                            {entry.status === 'active' && (
                              <span className="badge badge-success text-xs">Aktiv</span>
                            )}
                            {onEntryDelete && entry.status !== 'active' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEntryDelete(entry);
                                }}
                                className="h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// Helper function to calculate entry duration
function calculateDuration(entry: TimeEntryWithProperty): number {
  const start = new Date(entry.start_time).getTime();
  const end = entry.end_time
    ? new Date(entry.end_time).getTime()
    : Date.now();
  const duration = Math.floor((end - start) / 1000);
  return Math.max(0, duration - (entry.pause_duration || 0));
}
