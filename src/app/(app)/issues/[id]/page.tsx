'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Clock, User, Building2, Trash2, ArrowRightCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Header, PageContainer } from '@/components/layout/header';
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
import { useAuthStore } from '@/stores/auth-store';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';
import { swissFormat } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { IssueWithRelations } from '@/types/database';

const priorityConfig = {
  low: { label: 'Niedrig', class: 'bg-muted text-muted-foreground' },
  medium: { label: 'Mittel', class: 'badge-info' },
  high: { label: 'Hoch', class: 'badge-warning' },
  urgent: { label: 'Dringend', class: 'badge-error' },
};

const statusConfig = {
  open: { label: 'Offen', class: 'badge-error' },
  in_progress: { label: 'In Bearbeitung', class: 'badge-warning' },
  resolved: { label: 'Gelöst', class: 'badge-success' },
  closed: { label: 'Geschlossen', class: 'bg-muted text-muted-foreground' },
};

const categoryConfig = {
  damage: 'Schaden',
  cleaning: 'Reinigung',
  safety: 'Sicherheit',
  maintenance: 'Wartung',
  other: 'Sonstiges',
};

export default function IssueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const permissions = usePermissions();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const issueId = params.id as string;

  const { data: issue, isLoading } = useQuery({
    queryKey: ['issue', issueId],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('issues')
        .select(`
          *,
          property:properties (*),
          reporter:profiles!issues_reported_by_fkey (*),
          assignee:profiles!issues_assigned_to_fkey (*)
        `)
        .eq('id', issueId)
        .single();

      if (error) throw error;
      return data as IssueWithRelations;
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const supabase = getClient();

      // Fetch photo URLs before deleting
      const { data: issueData } = await supabase
        .from('issues')
        .select('photo_urls')
        .eq('id', issueId)
        .single();

      // Delete photos from storage
      const photoUrls: string[] = (issueData as any)?.photo_urls || [];
      if (photoUrls.length > 0) {
        const storagePaths = photoUrls
          .map((url: string) => {
            const match = url.match(/\/storage\/v1\/object\/public\/photos\/([^?]+)/);
            return match ? decodeURIComponent(match[1]) : null;
          })
          .filter((path): path is string => path !== null);

        if (storagePaths.length > 0) {
          await supabase.storage.from('photos').remove(storagePaths);
        }
      }

      const { error } = await supabase
        .from('issues')
        .delete()
        .eq('id', issueId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Meldung wurde gelöscht');
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      router.push('/issues');
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  // Convert meldung to aufgabe mutation
  const convertMutation = useMutation({
    mutationFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any).rpc('convert_meldung_to_aufgabe', {
        p_meldung_id: issueId,
        p_user_id: profile!.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast.success('Meldung wurde in Aufgabe umgewandelt');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['meldungen'] }),
        queryClient.invalidateQueries({ queryKey: ['aufgaben'] }),
        queryClient.invalidateQueries({ queryKey: ['issue', issueId] }),
      ]);
      router.push('/issues');
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <PageContainer header={<Header title="Problem" showBack />}>
        <div className="space-y-4">
          <div className="skeleton h-8 w-3/4" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-32 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (!issue) {
    return (
      <PageContainer header={<Header title="Problem" showBack />}>
        <div className="text-center py-12 text-muted-foreground">
          Problem nicht gefunden
        </div>
      </PageContainer>
    );
  }

  const priority = priorityConfig[issue.priority];
  const status = statusConfig[issue.status];

  return (
    <PageContainer
      header={<Header title="Problem" showBack backHref="/issues" />}
    >
      {/* Status and priority badges */}
      <div className="flex gap-2 mb-4">
        <span className={cn('badge', status.class)}>{status.label}</span>
        <span className={cn('badge', priority.class)}>{priority.label}</span>
        <span className="badge bg-muted text-muted-foreground">
          {categoryConfig[issue.category]}
        </span>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold mb-4">{issue.title}</h1>

      {/* Description */}
      {issue.description && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <h2 className="text-sm font-medium text-muted-foreground mb-2">
              Beschreibung
            </h2>
            <p className="whitespace-pre-wrap">{issue.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Photos */}
      {issue.photo_urls && issue.photo_urls.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              Fotos ({issue.photo_urls.length})
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {issue.photo_urls.map((url, index) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square rounded-lg overflow-hidden bg-muted"
                >
                  <img
                    src={url}
                    alt={`Foto ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Details */}
      <Card className="mb-4">
        <CardContent className="p-4 space-y-4">
          {/* Property */}
          <div className="flex items-start gap-3">
            <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Liegenschaft</p>
              <p className="font-medium">{issue.property.name}</p>
              <p className="text-sm text-muted-foreground">
                {issue.property.address}, {issue.property.postal_code}{' '}
                {issue.property.city}
              </p>
            </div>
          </div>

          {/* Reporter */}
          <div className="flex items-start gap-3">
            <User className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Gemeldet von</p>
              <p className="font-medium">
                {issue.reporter.first_name} {issue.reporter.last_name}
              </p>
            </div>
          </div>

          {/* Assignee */}
          {issue.assignee && (
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Zugewiesen an</p>
                <p className="font-medium">
                  {issue.assignee.first_name} {issue.assignee.last_name}
                </p>
              </div>
            </div>
          )}

          {/* Timestamp */}
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Erstellt</p>
              <p className="font-medium">
                {swissFormat.datetime(issue.created_at)}
              </p>
              <p className="text-sm text-muted-foreground">
                ({swissFormat.relative(issue.created_at)})
              </p>
            </div>
          </div>

          {/* Location */}
          {issue.latitude && issue.longitude && (
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Standort</p>
                <a
                  href={`https://maps.google.com/?q=${issue.latitude},${issue.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  Auf Karte anzeigen
                </a>
              </div>
            </div>
          )}

          {/* Resolved timestamp */}
          {issue.resolved_at && (
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-success-500 mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Gelöst</p>
                <p className="font-medium">
                  {swissFormat.datetime(issue.resolved_at)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Convert to Aufgabe button */}
      {permissions.canConvertMeldungen && !issue.converted_to_task && (
        <div className="mt-6">
          <Button
            variant="outline"
            size="touch"
            className="w-full border-primary-300 text-primary-600 hover:bg-primary-50"
            onClick={() => setShowConvertDialog(true)}
            leftIcon={<ArrowRightCircle className="h-5 w-5" />}
          >
            In Aufgabe umwandeln
          </Button>
        </div>
      )}

      {/* Delete button */}
      {permissions.canManageAufgaben && (
        <div className="mt-6">
          <Button
            variant="outline"
            size="touch"
            className="w-full border-error-300 text-error-600 hover:bg-error-50"
            onClick={() => setShowDeleteDialog(true)}
            leftIcon={<Trash2 className="h-5 w-5" />}
          >
            Meldung löschen
          </Button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Meldung löschen</DialogTitle>
            <DialogDescription>
              Sind Sie sicher, dass Sie diese Meldung löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Wird gelöscht...' : 'Löschen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert to Aufgabe dialog */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>In Aufgabe umwandeln</DialogTitle>
            <DialogDescription>
              Möchten Sie diese Meldung in eine Aufgabe umwandeln?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="p-3 bg-muted rounded-lg">
              <h4 className="font-medium">{issue.title}</h4>
              <p className="text-sm text-muted-foreground mt-1">
                {issue.property?.name}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConvertDialog(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => convertMutation.mutate()}
              disabled={convertMutation.isPending}
            >
              {convertMutation.isPending ? 'Wird umgewandelt...' : 'Umwandeln'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
