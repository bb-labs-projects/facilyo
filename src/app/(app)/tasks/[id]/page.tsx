'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  User,
  MapPin,
  Clock,
  Edit,
  CheckCircle,
  Trash2,
  AlertTriangle,
  Camera,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { AufgabeForm } from '@/components/aufgaben/aufgabe-form';
import { PhotoCapture } from '@/components/issues/photo-capture';
import { Textarea } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth-store';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';
import { swissFormat } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Aufgabe, AufgabeWithRelations, AufgabeUpdate } from '@/types/database';

const priorityClasses = {
  low: 'bg-muted text-muted-foreground',
  medium: 'badge-info',
  high: 'badge-warning',
  urgent: 'badge-error',
};

const statusClasses = {
  open: 'badge-error',
  in_progress: 'badge-warning',
  resolved: 'badge-success',
  closed: 'bg-muted text-muted-foreground',
};

export default function AufgabeDetailPage() {
  const t = useTranslations('tasks');
  const tCommon = useTranslations('common');

  const priorityConfig = {
    low: { label: t('priorities.low'), class: priorityClasses.low },
    medium: { label: t('priorities.medium'), class: priorityClasses.medium },
    high: { label: t('priorities.high'), class: priorityClasses.high },
    urgent: { label: t('priorities.urgent'), class: priorityClasses.urgent },
  };

  const statusConfig = {
    open: { label: t('statuses.open'), class: statusClasses.open },
    in_progress: { label: t('statuses.inProgress'), class: statusClasses.in_progress },
    resolved: { label: t('statuses.completed'), class: statusClasses.resolved },
    closed: { label: t('statuses.closed'), class: statusClasses.closed },
  };
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const permissions = usePermissions();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completionPhotos, setCompletionPhotos] = useState<string[]>([]);
  const [completionNotes, setCompletionNotes] = useState('');

  const aufgabeId = params.id as string;

  // Fetch aufgabe
  const { data: aufgabe, isLoading } = useQuery({
    queryKey: ['aufgabe', aufgabeId],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('aufgaben')
        .select(`
          *,
          property:properties (*),
          creator:profiles!aufgaben_created_by_fkey (*),
          assignee:profiles!aufgaben_assigned_to_fkey (*),
          source_meldung:issues (*)
        `)
        .eq('id', aufgabeId)
        .single();

      if (error) throw error;
      return data as AufgabeWithRelations;
    },
    enabled: !!aufgabeId,
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: AufgabeUpdate) => {
      const supabase = getClient();
      const { data: result, error } = await (supabase as any)
        .from('aufgaben')
        .update(data)
        .eq('id', aufgabeId)
        .select()
        .single();

      if (error) throw error;
      return result as Aufgabe;
    },
    onSuccess: () => {
      toast.success(t('detail.updated'));
      queryClient.invalidateQueries({ queryKey: ['aufgabe', aufgabeId] });
      queryClient.invalidateQueries({ queryKey: ['aufgaben'] });
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast.error(`${tCommon('error')}: ${error.message}`);
    },
  });

  // Complete mutation
  const completeMutation = useMutation({
    mutationFn: async ({ photoUrls, notes }: { photoUrls: string[]; notes: string }) => {
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
    onSuccess: () => {
      toast.success(t('detail.markedComplete'));
      queryClient.invalidateQueries({ queryKey: ['aufgabe', aufgabeId] });
      queryClient.invalidateQueries({ queryKey: ['aufgaben'] });
      queryClient.invalidateQueries({ queryKey: ['completed-tasks-notification-count'] });
      queryClient.invalidateQueries({ queryKey: ['new-tasks-notification-count'] });
      setShowCompleteDialog(false);
      setCompletionPhotos([]);
      setCompletionNotes('');
    },
    onError: (error: Error) => {
      toast.error(`${tCommon('error')}: ${error.message}`);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const supabase = getClient();

      // Fetch photo URLs and source meldung ID before deleting
      const { data: taskData } = await (supabase as any)
        .from('aufgaben')
        .select('source_meldung_id, completion_photo_urls, source_meldung:issues(photo_urls)')
        .eq('id', aufgabeId)
        .single();

      // Collect all photo URLs (completion + source meldung)
      const allPhotoUrls: string[] = [
        ...(taskData?.completion_photo_urls || []),
        ...(taskData?.source_meldung?.photo_urls || []),
      ];

      if (allPhotoUrls.length > 0) {
        const storagePaths = allPhotoUrls
          .map((url: string) => {
            const match = url.match(/\/storage\/v1\/object\/public\/photos\/([^?]+)/);
            return match ? decodeURIComponent(match[1]) : null;
          })
          .filter((path): path is string => path !== null);

        if (storagePaths.length > 0) {
          await supabase.storage.from('photos').remove(storagePaths);
        }
      }

      // Delete the task first (removes FK reference to issue)
      const { error } = await (supabase as any)
        .from('aufgaben')
        .delete()
        .eq('id', aufgabeId);

      if (error) throw error;

      // Delete the source meldung (issue) only if no other aufgaben reference it
      if (taskData?.source_meldung_id) {
        const { count } = await (supabase as any)
          .from('aufgaben')
          .select('id', { count: 'exact', head: true })
          .eq('source_meldung_id', taskData.source_meldung_id)
          .neq('id', aufgabeId);

        if (count === 0) {
          await (supabase as any)
            .from('issues')
            .delete()
            .eq('id', taskData.source_meldung_id);
        }
      }
    },
    onSuccess: () => {
      toast.success(t('detail.deleted'));
      queryClient.invalidateQueries({ queryKey: ['aufgaben'] });
      router.push('/tasks');
    },
    onError: (error: Error) => {
      toast.error(`${tCommon('error')}: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <PageContainer header={<Header title={t('detail.title')} showBack />}>
        <div className="text-center py-12 text-muted-foreground">
          {tCommon('loading')}
        </div>
      </PageContainer>
    );
  }

  if (!aufgabe) {
    return (
      <PageContainer header={<Header title={t('detail.title')} showBack />}>
        <div className="text-center py-12 text-muted-foreground">
          {t('detail.notFound')}
        </div>
      </PageContainer>
    );
  }

  if (isEditing) {
    return (
      <PageContainer header={<Header title={t('edit')} showBack />}>
        <AufgabeForm
          aufgabe={aufgabe}
          mode="edit"
          onSubmit={(data) => updateMutation.mutate(data as AufgabeUpdate)}
          onCancel={() => setIsEditing(false)}
          isLoading={updateMutation.isPending}
        />
      </PageContainer>
    );
  }

  const isOverdue =
    aufgabe.due_date &&
    new Date(aufgabe.due_date) < new Date() &&
    aufgabe.status !== 'resolved' &&
    aufgabe.status !== 'closed';

  const canEdit =
    permissions.canManageAufgaben ||
    aufgabe.assigned_to === profile?.id ||
    aufgabe.created_by === profile?.id;

  const canComplete =
    aufgabe.status !== 'resolved' &&
    aufgabe.status !== 'closed' &&
    (permissions.canManageAufgaben || aufgabe.assigned_to === profile?.id);

  return (
    <PageContainer
      header={
        <Header
          title={t('detail.title')}
          showBack
          rightElement={
            canEdit && (
              <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)}>
                <Edit className="h-5 w-5" />
              </Button>
            )
          }
        />
      }
    >
      {/* Title and status */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold mb-2">{aufgabe.title}</h1>
        <div className="flex items-center flex-wrap gap-2">
          <span className={cn('badge', statusConfig[aufgabe.status].class)}>
            {statusConfig[aufgabe.status].label}
          </span>
          <span className={cn('badge', priorityConfig[aufgabe.priority].class)}>
            {priorityConfig[aufgabe.priority].label}
          </span>
          {isOverdue && (
            <span className="badge badge-error flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {t('overdue')}
            </span>
          )}
        </div>
      </div>

      {/* Details */}
      <Card className="mb-4">
        <CardContent className="p-4 space-y-4">
          {/* Property */}
          {aufgabe.property && (
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">{t('detail.property')}</p>
                <p className="font-medium">{aufgabe.property.name}</p>
                <p className="text-sm text-muted-foreground">
                  {aufgabe.property.address}, {aufgabe.property.city}
                </p>
              </div>
            </div>
          )}

          {/* Due date */}
          {aufgabe.due_date && (
            <div className="flex items-start gap-3">
              <Calendar className={cn('h-5 w-5 mt-0.5', isOverdue ? 'text-error-600' : 'text-muted-foreground')} />
              <div>
                <p className="text-sm text-muted-foreground">{t('dueDate')}</p>
                <p className={cn('font-medium', isOverdue && 'text-error-600')}>
                  {swissFormat.date(aufgabe.due_date)}
                </p>
              </div>
            </div>
          )}

          {/* Assignee */}
          {aufgabe.assignee && (
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">{t('assignedTo')}</p>
                <p className="font-medium">
                  {aufgabe.assignee.first_name} {aufgabe.assignee.last_name}
                </p>
                <p className="text-sm text-muted-foreground">{aufgabe.assignee.email}</p>
              </div>
            </div>
          )}

          {/* Created */}
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">{t('detail.created')}</p>
              <p className="font-medium">{swissFormat.datetime(aufgabe.created_at)}</p>
              {aufgabe.creator && (
                <p className="text-sm text-muted-foreground">
                  {t('detail.createdBy', { name: `${aufgabe.creator.first_name} ${aufgabe.creator.last_name}` })}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      {aufgabe.description && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{tCommon('description')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{aufgabe.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Source meldung photos */}
      {aufgabe.source_meldung?.photo_urls && aufgabe.source_meldung.photo_urls.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Camera className="h-4 w-4" />
              {t('detail.issuePhotos')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {aufgabe.source_meldung.photo_urls.map((url: string, index: number) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square rounded-lg overflow-hidden bg-muted border"
                >
                  <img
                    src={url}
                    alt={t('detail.issuePhotoAlt', { index: index + 1 })}
                    className="w-full h-full object-cover"
                  />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completion info */}
      {aufgabe.completed_at && (
        <Card className="mb-4 bg-success-50 border-success-200">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-success-700">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">{t('detail.completedAt', { date: swissFormat.datetime(aufgabe.completed_at) })}</span>
            </div>
            {aufgabe.completion_notes && (
              <div className="pt-2">
                <p className="text-sm text-success-700 mb-1 font-medium">{t('detail.completionNotes')}</p>
                <p className="text-sm text-success-800 whitespace-pre-wrap bg-white p-3 rounded-lg border border-success-200">
                  {aufgabe.completion_notes}
                </p>
              </div>
            )}
            {aufgabe.completion_photo_urls && aufgabe.completion_photo_urls.length > 0 && (
              <div className="pt-2">
                <p className="text-sm text-success-700 mb-2 flex items-center gap-1">
                  <Camera className="h-4 w-4" />
                  {t('detail.proofPhotos')}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {aufgabe.completion_photo_urls.map((url, index) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aspect-square rounded-lg overflow-hidden bg-white border border-success-200"
                    >
                      <img
                        src={url}
                        alt={t('detail.proofPhotoAlt', { index: index + 1 })}
                        className="w-full h-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="space-y-3 mt-6">
        {canComplete && (
          <Button
            size="touch"
            className="w-full"
            onClick={() => setShowCompleteDialog(true)}
            leftIcon={<CheckCircle className="h-5 w-5" />}
          >
            {t('detail.markComplete')}
          </Button>
        )}

        {permissions.canManageAufgaben && (
          <Button
            variant="outline"
            size="touch"
            className="w-full border-error-300 text-error-600 hover:bg-error-50"
            onClick={() => setShowDeleteDialog(true)}
            leftIcon={<Trash2 className="h-5 w-5" />}
          >
            {t('detail.deleteTask')}
          </Button>
        )}
      </div>

      {/* Complete task dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={(open) => {
        setShowCompleteDialog(open);
        if (!open) {
          setCompletionPhotos([]);
          setCompletionNotes('');
        }
      }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{t('detail.completeTitle')}</DialogTitle>
            <DialogDescription>
              {t('detail.completeDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('detail.completionNotes')}</label>
              <Textarea
                placeholder={t('detail.completionNotesPlaceholder')}
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('detail.photosOptional')}</label>
              <PhotoCapture
                photos={completionPhotos}
                onPhotosChange={setCompletionPhotos}
                maxPhotos={3}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowCompleteDialog(false);
                setCompletionPhotos([]);
                setCompletionNotes('');
              }}
              className="w-full sm:w-auto"
            >
              {tCommon('cancel')}
            </Button>
            <Button
              onClick={() => completeMutation.mutate({ photoUrls: completionPhotos, notes: completionNotes })}
              disabled={completeMutation.isPending}
              className="w-full sm:w-auto"
              leftIcon={<CheckCircle className="h-4 w-4" />}
            >
              {completeMutation.isPending ? t('detail.marking') : t('detail.markComplete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('detail.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('detail.deleteConfirm')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {tCommon('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t('detail.deleting') : tCommon('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
