'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, Clock, AlertTriangle } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { swissFormat } from '@/lib/i18n';
import type { TimeEntryWithProperty, Property } from '@/types/database';

interface TimeEntryEditSheetProps {
  entry: TimeEntryWithProperty | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export function TimeEntryEditSheet({
  entry,
  open,
  onOpenChange,
  onSaved,
  onDeleted,
}: TimeEntryEditSheetProps) {
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Form state
  const [propertyId, setPropertyId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [pauseMinutes, setPauseMinutes] = useState('0');
  const [notes, setNotes] = useState('');

  // Fetch assigned properties
  const { data: properties = [] } = useQuery({
    queryKey: ['properties', profile?.id],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('property_assignments')
        .select('property:properties(*)')
        .eq('user_id', profile!.id);

      if (error) throw error;
      return (data as { property: Property }[]).map((d) => d.property);
    },
    enabled: !!profile?.id && open,
  });

  // Initialize form when entry changes
  useEffect(() => {
    if (entry) {
      setPropertyId(entry.property_id || '');
      setStartTime(formatTimeForInput(entry.start_time));
      setEndTime(entry.end_time ? formatTimeForInput(entry.end_time) : '');
      setPauseMinutes(String(Math.floor((entry.pause_duration || 0) / 60)));
      setNotes(entry.notes || '');
    }
  }, [entry]);

  // Calculate live duration preview
  const durationPreview = useMemo(() => {
    if (!startTime || !endTime) return null;

    const [startHours, startMins] = startTime.split(':').map(Number);
    const [endHours, endMins] = endTime.split(':').map(Number);

    const startSeconds = startHours * 3600 + startMins * 60;
    const endSeconds = endHours * 3600 + endMins * 60;
    const pauseSeconds = (parseInt(pauseMinutes) || 0) * 60;

    const durationSeconds = endSeconds - startSeconds - pauseSeconds;
    if (durationSeconds < 0) return null;

    return swissFormat.durationHuman(durationSeconds);
  }, [startTime, endTime, pauseMinutes]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!entry) return;

      // Prevent editing vacation entries
      if (entry.entry_type === 'vacation') {
        throw new Error('Ferieneinträge können nur über die Ferien-Seite verwaltet werden');
      }

      const supabase = getClient();

      // Build new timestamps using the entry's original date
      const entryDate = entry.start_time.split('T')[0];
      const newStartTime = `${entryDate}T${startTime}:00`;
      const newEndTime = endTime ? `${entryDate}T${endTime}:00` : null;

      const { error } = await (supabase as any)
        .from('time_entries')
        .update({
          property_id: entry.entry_type === 'property' ? propertyId : null,
          start_time: newStartTime,
          end_time: newEndTime,
          pause_duration: (parseInt(pauseMinutes) || 0) * 60,
          notes: notes || null,
        })
        .eq('id', entry.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-days'] });
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
      toast.success('Eintrag wurde gespeichert');
      onSaved();
    },
    onError: () => {
      toast.error('Fehler beim Speichern');
    },
  });

  // Check if entry is active (no end_time means still running)
  const isActive = entry?.status === 'active' || !entry?.end_time;

  const isVacation = entry?.entry_type === 'vacation';

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!entry) return;

      // Prevent deletion of active entries
      if (isActive) {
        throw new Error('Aktive Einträge können nicht gelöscht werden');
      }

      // Prevent deletion of vacation entries (must be managed via Ferien page)
      if (isVacation) {
        throw new Error('Ferieneinträge können nur über die Ferien-Seite verwaltet werden');
      }

      const supabase = getClient();

      // Fetch checklist instances with photo items before deleting (cascade will remove them)
      const { data: instances } = await (supabase as any)
        .from('checklist_instances')
        .select('completed_items, template:checklist_templates(items)')
        .eq('time_entry_id', entry.id);

      // Delete the time entry (cascades to checklist_instances)
      const { error } = await (supabase as any)
        .from('time_entries')
        .delete()
        .eq('id', entry.id);

      if (error) throw error;

      // Clean up photos from storage (best-effort after row deletion)
      if (instances && instances.length > 0) {
        const storagePaths: string[] = [];

        for (const instance of instances) {
          const items = (instance.template?.items || []) as { id: string; type: string }[];
          const photoItemIds = items
            .filter((item) => item.type === 'photo')
            .map((item) => item.id);

          const completed = instance.completed_items || {};
          for (const itemId of photoItemIds) {
            const value = completed[itemId];
            if (typeof value === 'string' && value.length > 0) {
              const match = value.match(/\/storage\/v1\/object\/public\/photos\/([^?]+)/);
              if (match) storagePaths.push(decodeURIComponent(match[1]));
            }
          }
        }

        if (storagePaths.length > 0) {
          const { error: storageError } = await supabase.storage.from('photos').remove(storagePaths);
          if (storageError) {
            console.error('Failed to delete checklist photos from storage:', storageError);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-days'] });
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
      toast.success('Eintrag wurde gelöscht');
      setShowDeleteDialog(false);
      onDeleted();
    },
    onError: () => {
      toast.error('Fehler beim Löschen');
    },
  });

  const handleSave = () => {
    if (entry?.entry_type === 'property' && !propertyId) {
      toast.error('Bitte wählen Sie eine Liegenschaft');
      return;
    }
    if (!startTime) {
      toast.error('Bitte geben Sie eine Startzeit ein');
      return;
    }
    updateMutation.mutate();
  };

  const handleDelete = () => {
    deleteMutation.mutate();
  };

  if (!entry) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle>Zeiteintrag bearbeiten</SheetTitle>
            <SheetDescription>
              {entry.property?.name || (entry.entry_type === 'travel' ? 'Fahrzeit' : entry.entry_type === 'break' ? 'Pause' : 'Zeiteintrag')}
            </SheetDescription>
          </SheetHeader>

          {isVacation ? (
            <div className="mt-6 space-y-3">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200 text-sm text-green-800">
                <p className="font-medium mb-1">Ferieneintrag</p>
                <p>Startzeit: {startTime}</p>
                <p>Endzeit: {endTime}</p>
                {durationPreview && <p>Dauer: {durationPreview}</p>}
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Ferieneinträge können nur über die Ferien-Seite verwaltet werden
              </p>
            </div>
          ) : (
          <div className="space-y-4 mt-6">
            {/* Property Select - only for property entries */}
            {entry.entry_type === 'property' && (
              <div className="w-full">
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Liegenschaft
                </label>
                <select
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  className="flex h-12 w-full rounded-lg border border-input bg-background px-4 py-3 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Start Time */}
            <Input
              label="Startzeit"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />

            {/* End Time */}
            <Input
              label="Endzeit"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />

            {/* Pause Duration */}
            <Input
              label="Pause in Minuten"
              type="number"
              min="0"
              value={pauseMinutes}
              onChange={(e) => setPauseMinutes(e.target.value)}
            />

            {/* Duration Preview */}
            {durationPreview && (
              <div className="flex items-center gap-2 p-3 bg-primary-50 rounded-lg">
                <Clock className="h-4 w-4 text-primary-600" />
                <span className="text-sm text-primary-700">
                  Dauer: <span className="font-semibold">{durationPreview}</span>
                </span>
              </div>
            )}

            {/* Notes */}
            <Textarea
              label="Notizen"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optionale Notizen..."
              rows={3}
            />
          </div>
          )}

          <SheetFooter className="mt-6 flex-col gap-2">
            {!isVacation && (
            <Button
              onClick={handleSave}
              isLoading={updateMutation.isPending}
              className="w-full"
            >
              Speichern
            </Button>
            )}
            {!isActive && !isVacation && !showDeleteDialog && (
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                leftIcon={<Trash2 className="h-4 w-4" />}
                className="w-full"
              >
                Löschen
              </Button>
            )}
            {!isActive && !isVacation && showDeleteDialog && (
              <div className="w-full rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-900">Eintrag löschen?</p>
                    <p className="text-sm text-red-700 mt-1">
                      Diese Aktion kann nicht rückgängig gemacht werden.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setShowDeleteDialog(false)}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    onClick={handleDelete}
                    isLoading={deleteMutation.isPending}
                  >
                    Löschen
                  </Button>
                </div>
              </div>
            )}
            {isActive && (
              <p className="text-xs text-center text-muted-foreground">
                Aktive Einträge können nicht gelöscht werden
              </p>
            )}
            {isVacation && (
              <p className="text-xs text-center text-muted-foreground">
                Ferieneinträge können nur über die Ferien-Seite verwaltet werden
              </p>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

// Helper to format ISO timestamp to HH:MM for input
function formatTimeForInput(timestamp: string): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}
