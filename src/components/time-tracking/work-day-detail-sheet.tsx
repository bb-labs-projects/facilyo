'use client';

import { useState } from 'react';
import { Clock, MapPin, Car } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { TimeEntryCard } from './work-day-card';
import { TimeEntryEditSheet } from './time-entry-edit-sheet';
import { useTranslations } from 'next-intl';
import { swissFormat } from '@/lib/i18n';
import type { WorkDayWithEntries, TimeEntryWithProperty } from '@/types/database';

interface WorkDayDetailSheetProps {
  workDay: WorkDayWithEntries | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEntryUpdated: () => void;
}

export function WorkDayDetailSheet({
  workDay,
  open,
  onOpenChange,
  onEntryUpdated,
}: WorkDayDetailSheetProps) {
  const [selectedEntry, setSelectedEntry] = useState<TimeEntryWithProperty | null>(null);
  const tc = useTranslations('common');
  const tWork = useTranslations('workDay');
  const tEntry = useTranslations('entryTypes');
  const tTime = useTranslations('timeTracking');
  const tProp = useTranslations('properties');

  if (!workDay) return null;

  // Calculate work day duration (total time including travel)
  const workDaySeconds = workDay.end_time
    ? Math.floor((new Date(workDay.end_time).getTime() - new Date(workDay.start_time).getTime()) / 1000)
    : Math.floor((Date.now() - new Date(workDay.start_time).getTime()) / 1000);

  // Calculate sum of time entries (actual work time at properties)
  const entriesSeconds = workDay.time_entries.reduce((acc, entry) => {
    if (!entry.end_time) return acc;
    const start = new Date(entry.start_time).getTime();
    const end = new Date(entry.end_time).getTime();
    const duration = Math.floor((end - start) / 1000);
    return acc + duration - (entry.pause_duration || 0);
  }, 0);

  // Travel time estimate = work day duration - sum of entries
  const travelSeconds = Math.max(0, workDaySeconds - entriesSeconds);

  // Count unique properties
  const uniqueProperties = new Set(workDay.time_entries.map((e) => e.property_id)).size;

  const handleEntryClick = (entry: TimeEntryWithProperty) => {
    setSelectedEntry(entry);
  };

  const handleEntryUpdated = () => {
    setSelectedEntry(null);
    onEntryUpdated();
  };

  const handleEntryDeleted = () => {
    setSelectedEntry(null);
    onEntryUpdated();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle>
              {swissFormat.date(workDay.date, 'EEEE, dd. MMMM')}
            </SheetTitle>
            <SheetDescription>
              {tWork('title')} {tc('details')}
            </SheetDescription>
          </SheetHeader>

          {/* Summary Row */}
          <div className="grid grid-cols-3 gap-4 mt-6 p-4 bg-muted/50 rounded-lg">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">{tc('start')}</p>
              <p className="font-semibold">{swissFormat.time(workDay.start_time)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">{tc('end')}</p>
              <p className="font-semibold">
                {workDay.end_time ? swissFormat.time(workDay.end_time) : '—'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">{tc('total')}</p>
              <p className="font-semibold">{swissFormat.durationHuman(workDaySeconds)}</p>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>
                {uniqueProperties} {uniqueProperties === 1 ? tProp('singular') : tProp('plural')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Car className="h-4 w-4" />
              <span>~{swissFormat.durationHuman(travelSeconds)} {tEntry('travel')}</span>
            </div>
          </div>

          {/* Time Entries List */}
          <div className="mt-6">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {tTime('entries')}
            </h3>
            {workDay.time_entries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {tTime('noEntries')}
              </div>
            ) : (
              <div className="space-y-3">
                {workDay.time_entries.map((entry) => (
                  <TimeEntryCard
                    key={entry.id}
                    entry={entry}
                    onClick={() => handleEntryClick(entry)}
                  />
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Nested Edit Sheet */}
      <TimeEntryEditSheet
        entry={selectedEntry}
        open={!!selectedEntry}
        onOpenChange={(open) => !open && setSelectedEntry(null)}
        onSaved={handleEntryUpdated}
        onDeleted={handleEntryDeleted}
      />
    </>
  );
}
