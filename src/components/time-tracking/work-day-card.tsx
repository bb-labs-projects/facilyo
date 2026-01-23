'use client';

import { Calendar, Clock, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { swissFormat } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { WorkDay, TimeEntryWithProperty } from '@/types/database';

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
  // Calculate total work time
  const totalSeconds = entries.reduce((acc, entry) => {
    if (!entry.end_time) return acc;
    const start = new Date(entry.start_time).getTime();
    const end = new Date(entry.end_time).getTime();
    const duration = Math.floor((end - start) / 1000);
    return acc + duration - (entry.pause_duration || 0);
  }, 0);

  // Count unique properties
  const uniqueProperties = new Set(entries.map((e) => e.property_id)).size;

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

          <div className="flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            <span>
              {uniqueProperties} {uniqueProperties === 1 ? 'Liegenschaft' : 'Liegenschaften'}
            </span>
          </div>
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

  // Calculate duration
  const getDuration = () => {
    const start = new Date(entry.start_time).getTime();
    const end = entry.end_time
      ? new Date(entry.end_time).getTime()
      : Date.now();
    const duration = Math.floor((end - start) / 1000);
    return duration - (entry.pause_duration || 0);
  };

  return (
    <Card
      interactive={!!onClick}
      onClick={onClick}
      className={cn(
        isActive && 'border-success-500 bg-success-50/50',
        isPaused && 'border-warning-500 bg-warning-50/50',
        className
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{entry.property.name}</h3>
            <p className="text-sm text-muted-foreground">
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
