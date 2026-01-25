'use client';

import { Calendar, Clock, MapPin, Car, Coffee, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { swissFormat } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { WorkDay, TimeEntryWithProperty, TimeEntryType } from '@/types/database';

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
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-700',
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
  className?: string;
}

export function TimeEntryCard({
  entry,
  onClick,
  className,
}: TimeEntryCardProps) {
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

  return (
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
        </div>

        {/* Property address for property entries */}
        {entryType === 'property' && entry.property && (
          <p className="mt-2 text-xs text-muted-foreground">
            {entry.property.address}, {entry.property.city}
          </p>
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
  );
}

// List of time entries
interface TimeEntryListProps {
  entries: TimeEntryWithProperty[];
  onEntryClick?: (entry: TimeEntryWithProperty) => void;
  emptyMessage?: string;
  className?: string;
}

export function TimeEntryList({
  entries,
  onEntryClick,
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
        />
      ))}
    </div>
  );
}
