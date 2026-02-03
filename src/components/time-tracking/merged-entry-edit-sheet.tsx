'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Building2, Wrench, Trees, Scissors, ClipboardList, Home, Briefcase, Clock, Pencil } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { swissFormat } from '@/lib/i18n';
import type { TimeEntryWithProperty, ActivityType } from '@/types/database';
import { TimeEntryEditSheet } from './time-entry-edit-sheet';

// Activity type display configuration
const ACTIVITY_CONFIG: Record<ActivityType, { label: string; icon: typeof Wrench; color: string; bgColor: string }> = {
  hauswartung: { label: 'Hauswartung', icon: Wrench, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  rasen_maehen: { label: 'Rasen mähen', icon: Trees, color: 'text-green-600', bgColor: 'bg-green-50' },
  hecken_schneiden: { label: 'Hecken schneiden', icon: Scissors, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  regie: { label: 'Regie', icon: ClipboardList, color: 'text-purple-600', bgColor: 'bg-purple-50' },
  privatunterhalt: { label: 'Privatunterhalt', icon: Home, color: 'text-rose-600', bgColor: 'bg-rose-50' },
  buero: { label: 'Büro', icon: Briefcase, color: 'text-slate-600', bgColor: 'bg-slate-50' },
};

interface MergedEntryEditSheetProps {
  entries: TimeEntryWithProperty[];
  propertyName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEntryUpdated: () => void;
}

export function MergedEntryEditSheet({
  entries,
  propertyName,
  open,
  onOpenChange,
  onEntryUpdated,
}: MergedEntryEditSheetProps) {
  const [selectedEntry, setSelectedEntry] = useState<TimeEntryWithProperty | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);

  // Sort entries by start time
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  // Calculate total duration
  const totalDuration = sortedEntries.reduce((sum, entry) => {
    const start = new Date(entry.start_time).getTime();
    const end = entry.end_time ? new Date(entry.end_time).getTime() : Date.now();
    return sum + Math.floor((end - start) / 1000);
  }, 0);

  // Get overall time range
  const firstEntry = sortedEntries[0];
  const lastEntry = sortedEntries[sortedEntries.length - 1];
  const overallStartTime = firstEntry ? format(parseISO(firstEntry.start_time), 'HH:mm') : '';
  const overallEndTime = lastEntry?.end_time ? format(parseISO(lastEntry.end_time), 'HH:mm') : 'läuft';

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
    onEntryUpdated();
  };

  const handleEntryDeleted = () => {
    setEditSheetOpen(false);
    setSelectedEntry(null);
    onEntryUpdated();
    // If all entries are deleted, close the merged sheet too
    if (entries.length <= 1) {
      onOpenChange(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary-600" />
              {propertyName}
            </SheetTitle>
            <SheetDescription className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {overallStartTime} - {overallEndTime}
              </span>
              <span className="font-medium">
                Gesamt: {swissFormat.durationHuman(totalDuration)}
              </span>
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              Aktivitäten ({sortedEntries.length})
            </h3>

            {sortedEntries.map((entry) => {
              const activityConfig = entry.activity_type ? ACTIVITY_CONFIG[entry.activity_type] : null;
              const ActivityIcon = activityConfig?.icon || Building2;
              const startTime = format(parseISO(entry.start_time), 'HH:mm');
              const endTime = entry.end_time ? format(parseISO(entry.end_time), 'HH:mm') : null;
              const isActive = !entry.end_time;

              // Calculate duration for this entry
              const start = new Date(entry.start_time).getTime();
              const end = entry.end_time ? new Date(entry.end_time).getTime() : Date.now();
              const duration = Math.floor((end - start) / 1000);

              return (
                <button
                  key={entry.id}
                  onClick={() => handleEntryClick(entry)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-lg border transition-all',
                    'hover:shadow-md hover:border-primary-300 active:scale-[0.99]',
                    'text-left',
                    activityConfig?.bgColor || 'bg-primary-50',
                    'border-gray-200'
                  )}
                >
                  <div className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-full',
                    activityConfig?.bgColor || 'bg-primary-100'
                  )}>
                    <ActivityIcon className={cn('h-5 w-5', activityConfig?.color || 'text-primary-600')} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-medium">
                      {activityConfig?.label || 'Ohne Aktivität'}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <span className="font-mono">
                        {startTime} - {endTime || ''}
                        {isActive && (
                          <span className="inline-flex items-center gap-1 ml-1">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                            </span>
                          </span>
                        )}
                      </span>
                      <span className="text-primary-600 font-medium">
                        {swissFormat.durationHuman(duration)}
                      </span>
                    </div>
                  </div>

                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </button>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full"
            >
              Schliessen
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Individual Entry Edit Sheet */}
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
