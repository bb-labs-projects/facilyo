'use client';

import { Building2, Car, Coffee, Wrench, Trees, Scissors, ClipboardList, Home, Briefcase, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { swissFormat } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { TimeEntryWithProperty, TimeEntryType, ActivityType } from '@/types/database';

interface PropertyTimeSummaryProps {
  entries: TimeEntryWithProperty[];
  className?: string;
}

interface VisitSummary {
  id: string;
  name: string;
  type: TimeEntryType;
  propertyId: string | null;
  entryCount: number;
  totalSeconds: number;
  activityBreakdown: Map<ActivityType, number>;
  startTime: Date;
  endTime: Date | null;
}

// Entry type display configuration
const ENTRY_TYPE_CONFIG: Record<TimeEntryType, {
  label: string;
  icon: typeof Car;
  color: string;
}> = {
  property: {
    label: 'Liegenschaft',
    icon: Building2,
    color: 'text-primary-900',
  },
  travel: {
    label: 'Fahrzeit',
    icon: Car,
    color: 'text-amber-600',
  },
  break: {
    label: 'Pause',
    icon: Coffee,
    color: 'text-orange-600',
  },
};

// Activity type display configuration
const ACTIVITY_TYPE_CONFIG: Record<ActivityType, {
  label: string;
  icon: typeof Wrench;
  color: string;
}> = {
  hauswartung: { label: 'Hauswartung', icon: Wrench, color: 'text-blue-600' },
  rasen_maehen: { label: 'Rasen', icon: Trees, color: 'text-green-600' },
  hecken_schneiden: { label: 'Hecken', icon: Scissors, color: 'text-emerald-600' },
  regie: { label: 'Regie', icon: ClipboardList, color: 'text-purple-600' },
  privatunterhalt: { label: 'Privat', icon: Home, color: 'text-rose-600' },
  buero: { label: 'Büro', icon: Briefcase, color: 'text-slate-600' },
};

export function PropertyTimeSummary({ entries, className }: PropertyTimeSummaryProps) {
  // Sort entries chronologically first
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  // Group entries into "visits" - consecutive property entries on the same property
  // Travel and break entries interrupt a visit, creating separate visits for the same property
  const visits: VisitSummary[] = [];
  let currentVisit: VisitSummary | null = null;

  for (const entry of sortedEntries) {
    // Calculate duration first to filter zero-duration entries
    const start = new Date(entry.start_time);
    const end = entry.end_time ? new Date(entry.end_time) : new Date();
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000) - (entry.pause_duration || 0);

    // Skip entries with zero or negative duration (completed entries only)
    if (entry.end_time && duration <= 0) {
      continue;
    }

    const entryType = entry.entry_type || 'property';

    // Travel and break entries are always separate items
    if (entryType === 'travel' || entryType === 'break') {
      // Close any current property visit
      if (currentVisit) {
        visits.push(currentVisit);
        currentVisit = null;
      }

      // Add travel/break as its own entry
      visits.push({
        id: `${entryType}-${entry.id}`,
        name: ENTRY_TYPE_CONFIG[entryType].label,
        type: entryType,
        propertyId: null,
        entryCount: 1,
        totalSeconds: Math.max(0, duration),
        activityBreakdown: new Map(),
        startTime: start,
        endTime: entry.end_time ? end : null,
      });
      continue;
    }

    // Property entry - check if we can merge with current visit
    if (
      currentVisit &&
      currentVisit.type === 'property' &&
      currentVisit.propertyId === entry.property_id
    ) {
      // Same property, add to current visit
      currentVisit.entryCount += 1;
      currentVisit.totalSeconds += Math.max(0, duration);
      currentVisit.endTime = entry.end_time ? end : null;

      if (entry.activity_type) {
        const currentActivityTime = currentVisit.activityBreakdown.get(entry.activity_type) || 0;
        currentVisit.activityBreakdown.set(entry.activity_type, currentActivityTime + Math.max(0, duration));
      }
    } else {
      // Different property or first entry - close current visit and start new one
      if (currentVisit) {
        visits.push(currentVisit);
      }

      const name = entry.property?.name || 'Unbekannte Liegenschaft';
      currentVisit = {
        id: `visit-${entry.id}`,
        name,
        type: 'property',
        propertyId: entry.property_id,
        entryCount: 1,
        totalSeconds: Math.max(0, duration),
        activityBreakdown: new Map(),
        startTime: start,
        endTime: entry.end_time ? end : null,
      };

      if (entry.activity_type) {
        currentVisit.activityBreakdown.set(entry.activity_type, Math.max(0, duration));
      }
    }
  }

  // Don't forget the last visit
  if (currentVisit) {
    visits.push(currentVisit);
  }

  // Visits are already in chronological order
  const sortedSummaries = visits;

  if (sortedSummaries.length === 0) {
    return null;
  }

  // Helper to format minutes
  const formatMinutes = (seconds: number): string => {
    const minutes = Math.round(seconds / 60);
    return `${minutes}m`;
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Zeitübersicht
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sortedSummaries.map((summary) => {
          const config = ENTRY_TYPE_CONFIG[summary.type];
          const Icon = config.icon;
          const hasActivities = summary.activityBreakdown.size > 0;
          const isActive = summary.endTime === null;
          const startTimeStr = format(summary.startTime, 'HH:mm');
          const endTimeStr = summary.endTime ? format(summary.endTime, 'HH:mm') : '';

          return (
            <div
              key={summary.id}
              className="py-2 border-b last:border-0"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Icon className={cn('h-4 w-4 flex-shrink-0', config.color)} />
                  <span className="font-medium truncate">{summary.name}</span>
                </div>
                <span className="font-mono text-sm font-medium ml-2">
                  {swissFormat.durationHuman(summary.totalSeconds)}
                </span>
              </div>

              {/* Time range */}
              <div className="flex items-center gap-1.5 mt-1 ml-6 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span className="font-mono">
                  {startTimeStr} - {endTimeStr}
                  {isActive && (
                    <span className="inline-flex items-center ml-1">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                      </span>
                    </span>
                  )}
                </span>
              </div>

              {/* Activity breakdown for property entries */}
              {hasActivities && (
                <div className="flex flex-wrap gap-2 mt-1.5 ml-6">
                  {Array.from(summary.activityBreakdown.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([activityType, seconds]) => {
                      const actConfig = ACTIVITY_TYPE_CONFIG[activityType];
                      const ActivityIcon = actConfig.icon;
                      return (
                        <div
                          key={activityType}
                          className="flex items-center gap-1 text-xs"
                          title={actConfig.label}
                        >
                          <ActivityIcon className={cn('h-3.5 w-3.5', actConfig.color)} />
                          <span className="font-mono text-muted-foreground">
                            {formatMinutes(seconds)}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
