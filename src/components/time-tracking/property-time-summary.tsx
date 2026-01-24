'use client';

import { Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { swissFormat } from '@/lib/i18n';
import type { TimeEntryWithProperty } from '@/types/database';

interface PropertyTimeSummaryProps {
  entries: TimeEntryWithProperty[];
  className?: string;
}

interface PropertySummary {
  propertyId: string;
  propertyName: string;
  entryCount: number;
  totalSeconds: number;
}

export function PropertyTimeSummary({ entries, className }: PropertyTimeSummaryProps) {
  // Aggregate time entries by property
  const summaries = entries.reduce<Record<string, PropertySummary>>((acc, entry) => {
    const propertyId = entry.property_id;
    const propertyName = entry.property?.name || 'Unbekannte Liegenschaft';

    if (!acc[propertyId]) {
      acc[propertyId] = {
        propertyId,
        propertyName,
        entryCount: 0,
        totalSeconds: 0,
      };
    }

    acc[propertyId].entryCount += 1;

    // Calculate duration for completed entries
    if (entry.end_time) {
      const start = new Date(entry.start_time).getTime();
      const end = new Date(entry.end_time).getTime();
      const duration = Math.floor((end - start) / 1000) - (entry.pause_duration || 0);
      acc[propertyId].totalSeconds += Math.max(0, duration);
    }

    return acc;
  }, {});

  const sortedSummaries = Object.values(summaries).sort(
    (a, b) => b.totalSeconds - a.totalSeconds
  );

  if (sortedSummaries.length === 0) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Zeit pro Liegenschaft
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sortedSummaries.map((summary) => (
          <div
            key={summary.propertyId}
            className="flex items-center justify-between py-2 border-b last:border-0"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="font-medium truncate">{summary.propertyName}</span>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {summary.entryCount} {summary.entryCount === 1 ? 'Eintrag' : 'Einträge'}
              </span>
            </div>
            <span className="font-mono text-sm font-medium ml-2">
              {swissFormat.durationHuman(summary.totalSeconds)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
