'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, Clock } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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

      const supabase = getClient();

      // Build new timestamps using the entry's original date
      const entryDate = entry.start_time.split('T')[0];
      const newStartTime = `${entryDate}T${startTime}:00`;
      const newEndTime = endTime ? `${entryDate}T${endTime}:00` : null;

      const { error } = await (supabase as any)
        .from('time_entries')
        .update({
          property_id: propertyId,
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

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!entry) return;

      const supabase = getClient();
      const { error } = await (supabase as any)
        .from('time_entries')
        .delete()
        .eq('id', entry.id);

      if (error) throw error;
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
    if (!propertyId) {
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
              {entry.property.name}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 mt-6">
            {/* Property Select */}
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

          <SheetFooter className="mt-6 flex-col gap-2">
            <Button
              onClick={handleSave}
              isLoading={updateMutation.isPending}
              className="w-full"
            >
              Speichern
            </Button>
            <Button
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              leftIcon={<Trash2 className="h-4 w-4" />}
              className="w-full"
            >
              Löschen
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eintrag löschen?</DialogTitle>
            <DialogDescription>
              Möchten Sie diesen Zeiteintrag wirklich löschen? Diese Aktion kann nicht
              rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              isLoading={deleteMutation.isPending}
            >
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
