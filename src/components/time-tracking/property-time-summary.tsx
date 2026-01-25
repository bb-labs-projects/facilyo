'use client';

import { Building2, Car, Coffee } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { swissFormat } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { TimeEntryWithProperty, TimeEntryType } from '@/types/database';

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
    color: 'text-blue-600',
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

export function PropertyTimeSummary({ entries, className }: PropertyTimeSummaryProps) {
  // Aggregate time entries by property (for property entries) or by type (for travel/break)
  const summaries = entries.reduce<Record<string, EntrySummary>>((acc, entry) => {
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
      };
    }

    acc[key].entryCount += 1;

    // Calculate duration
    const start = new Date(entry.start_time).getTime();
    const end = entry.end_time ? new Date(entry.end_time).getTime() : Date.now();
    const duration = Math.floor((end - start) / 1000) - (entry.pause_duration || 0);
    acc[key].totalSeconds += Math.max(0, duration);

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

          return (
            <div
              key={summary.id}
              className="flex items-center justify-between py-2 border-b last:border-0"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Icon className={cn('h-4 w-4 flex-shrink-0', config.color)} />
                <span className="font-medium truncate">{summary.name}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {summary.entryCount} {summary.entryCount === 1 ? 'Eintrag' : 'Einträge'}
                </span>
              </div>
              <span className="font-mono text-sm font-medium ml-2">
                {swissFormat.durationHuman(summary.totalSeconds)}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
