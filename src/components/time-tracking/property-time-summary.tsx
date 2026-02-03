'use client';

import { Building2, Car, Coffee, Wrench, Trees, Scissors, ClipboardList, Home, Briefcase } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { swissFormat } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { TimeEntryWithProperty, TimeEntryType, ActivityType } from '@/types/database';

interface PropertyTimeSummaryProps {
  entries: TimeEntryWithProperty[];
  className?: string;
}

interface EntrySummary {
  id: string;
  name: string;
  type: TimeEntryType;
  entryCount: number;
  totalSeconds: number;
  activityBreakdown: Map<ActivityType, number>;
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
  // Aggregate time entries by property (for property entries) or by type (for travel/break)
  // Filter out zero-duration entries (e.g., from auto-stop at same time as start)
  const summaries = entries.reduce<Record<string, EntrySummary>>((acc, entry) => {
    // Calculate duration first to filter zero-duration entries
    const start = new Date(entry.start_time).getTime();
    const end = entry.end_time ? new Date(entry.end_time).getTime() : Date.now();
    const duration = Math.floor((end - start) / 1000) - (entry.pause_duration || 0);

    // Skip entries with zero or negative duration (completed entries only)
    if (entry.end_time && duration <= 0) {
      return acc;
    }

    const entryType = entry.entry_type || 'property';
    let key: string;
    let name: string;

    if (entryType === 'property' && entry.property_id) {
      key = `property-${entry.property_id}`;
      name = entry.property?.name || 'Unbekannte Liegenschaft';
    } else {
      key = entryType;
      name = ENTRY_TYPE_CONFIG[entryType].label;
    }

    if (!acc[key]) {
      acc[key] = {
        id: key,
        name,
        type: entryType,
        entryCount: 0,
        totalSeconds: 0,
        activityBreakdown: new Map(),
      };
    }

    acc[key].entryCount += 1;
    acc[key].totalSeconds += Math.max(0, duration);

    // Track activity breakdown for property entries
    if (entryType === 'property' && entry.activity_type) {
      const currentActivityTime = acc[key].activityBreakdown.get(entry.activity_type) || 0;
      acc[key].activityBreakdown.set(entry.activity_type, currentActivityTime + Math.max(0, duration));
    }

    return acc;
  }, {});

  // Sort: properties first (by time), then travel, then break
  const sortedSummaries = Object.values(summaries).sort((a, b) => {
    // Sort by type priority first
    const typePriority: Record<TimeEntryType, number> = {
      property: 0,
      travel: 1,
      break: 2,
    };

    const priorityDiff = typePriority[a.type] - typePriority[b.type];
    if (priorityDiff !== 0) return priorityDiff;

    // Then by total seconds
    return b.totalSeconds - a.totalSeconds;
  });

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

              {/* Activity breakdown for property entries */}
              {hasActivities && (
                <div className="flex flex-wrap gap-2 mt-2 ml-6">
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
