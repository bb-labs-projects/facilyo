'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ListTodo, ChevronRight, Check, Calendar, AlertTriangle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { PhotoCapture } from '@/components/issues/photo-capture';
import { Textarea } from '@/components/ui/input';
import { getClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { swissFormat } from '@/lib/i18n';
import { cn, hapticFeedback } from '@/lib/utils';
import type { Aufgabe, AufgabeWithRelations } from '@/types/database';

const priorityConfig = {
  low: { label: 'Niedrig', class: 'bg-muted text-muted-foreground' },
  medium: { label: 'Mittel', class: 'badge-info' },
  high: { label: 'Hoch', class: 'badge-warning' },
  urgent: { label: 'Dringend', class: 'badge-error' },
};

const statusConfig = {
  open: { label: 'Offen', class: 'badge-error' },
  in_progress: { label: 'In Bearbeitung', class: 'badge-warning' },
  resolved: { label: 'Erledigt', class: 'badge-success' },
  closed: { label: 'Geschlossen', class: 'bg-muted text-muted-foreground' },
};

interface ActiveAufgabenProps {
  propertyId: string;
  className?: string;
}

export function ActiveAufgaben({ propertyId, className }: ActiveAufgabenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const [completingAufgabe, setCompletingAufgabe] = useState<AufgabeWithRelations | null>(null);
  const [completionPhotos, setCompletionPhotos] = useState<string[]>([]);
  const [completionNotes, setCompletionNotes] = useState('');

  // Fetch aufgaben for the property
  const { data: aufgaben = [] } = useQuery({
    queryKey: ['property-aufgaben', propertyId],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('aufgaben')
        .select(`
          *,
          property:properties (*),
          creator:profiles!aufgaben_created_by_fkey (*),
          assignee:profiles!aufgaben_assigned_to_fkey (*)
        `)
        .eq('property_id', propertyId)
        .in('status', ['open', 'in_progress'])
        .order('priority', { ascending: false })
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data as AufgabeWithRelations[];
    },
    enabled: !!propertyId,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });

  // Mark aufgabe as resolved
  const completeMutation = useMutation({
    mutationFn: async ({ aufgabeId, photoUrls, notes }: { aufgabeId: string; photoUrls: string[]; notes: string }) => {
      const supabase = getClient();
      const { error } = await (supabase as any)
        .from('aufgaben')
        .update({
          status: 'resolved',
          completed_at: new Date().toISOString(),
          completed_by: profile!.id,
          completion_photo_urls: photoUrls,
          completion_notes: notes || null,
        })
        .eq('id', aufgabeId);

      if (error) throw error;
    },
    onSuccess: async () => {
      hapticFeedback('medium');
      toast.success('Aufgabe wurde als erledigt markiert');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['property-aufgaben', propertyId] }),
        queryClient.invalidateQueries({ queryKey: ['aufgaben'] })
      ]);
      setCompletingAufgabe(null);
      setCompletionPhotos([]);
      setCompletionNotes('');
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  if (aufgaben.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <ListTodo className="h-4 w-4" />
        Aufgaben für diese Liegenschaft
        <span className="bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full text-xs">
          {aufgaben.length}
        </span>
      </h3>

      <div className="space-y-2">
        {aufgaben.map((aufgabe) => (
          <Card
            key={aufgabe.id}
            className={cn(
              'overflow-hidden',
              aufgabe.priority === 'urgent' && 'border-error-300',
              aufgabe.priority === 'high' && 'border-warning-300'
            )}
          >
            <CardContent className="p-3">
              <div className="flex items-start gap-3">
                {/* Complete button */}
                <button
                  onClick={() => {
                    hapticFeedback('light');
                    setCompletingAufgabe(aufgabe);
                  }}
                  className="flex-shrink-0 w-6 h-6 mt-0.5 rounded-md border-2 border-muted-foreground/50 hover:border-primary-500 hover:bg-primary-50 transition-colors flex items-center justify-center"
                  title="Als erledigt markieren"
                >
                  <Check className="h-4 w-4 text-transparent hover:text-primary-500" />
                </button>

                {/* Content */}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => router.push(`/tasks/${aufgabe.id}`)}
                >
                  <h4 className="font-medium text-sm line-clamp-1">{aufgabe.title}</h4>

                  {aufgabe.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {aufgabe.description}
                    </p>
                  )}

                  {/* Meta */}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className={cn('badge text-xs', statusConfig[aufgabe.status].class)}>
                      {statusConfig[aufgabe.status].label}
                    </span>
                    <span className={cn('badge text-xs', priorityConfig[aufgabe.priority].class)}>
                      {priorityConfig[aufgabe.priority].label}
                    </span>
                    {aufgabe.due_date && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {swissFormat.date(aufgabe.due_date)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <ChevronRight
                  className="h-5 w-5 text-muted-foreground flex-shrink-0 cursor-pointer"
                  onClick={() => router.push(`/tasks/${aufgabe.id}`)}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Confirm completion dialog */}
      <Dialog open={!!completingAufgabe} onOpenChange={(open) => {
        if (!open) {
          setCompletingAufgabe(null);
          setCompletionPhotos([]);
          setCompletionNotes('');
        }
      }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Aufgabe abschliessen</DialogTitle>
            <DialogDescription>
              Optional: Beschreiben Sie die Lösung und fügen Sie Fotos hinzu.
            </DialogDescription>
          </DialogHeader>

          {completingAufgabe && (
            <div className="py-2 space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <h4 className="font-medium">{completingAufgabe.title}</h4>
                {completingAufgabe.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {completingAufgabe.description}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Abschluss-Notizen</label>
                <Textarea
                  placeholder="Beschreiben Sie die durchgeführten Arbeiten..."
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Fotos (optional)</label>
                <PhotoCapture
                  photos={completionPhotos}
                  onPhotosChange={setCompletionPhotos}
                  maxPhotos={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCompletingAufgabe(null);
                setCompletionPhotos([]);
                setCompletionNotes('');
              }}
              className="w-full sm:w-auto"
            >
              Abbrechen
            </Button>
            <Button
              onClick={() => completingAufgabe && completeMutation.mutate({
                aufgabeId: completingAufgabe.id,
                photoUrls: completionPhotos,
                notes: completionNotes
              })}
              disabled={completeMutation.isPending}
              className="w-full sm:w-auto"
              leftIcon={<CheckCircle className="h-4 w-4" />}
            >
              {completeMutation.isPending ? 'Wird gespeichert...' : 'Als erledigt markieren'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
