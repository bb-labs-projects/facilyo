'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Clock, User, Building2, Trash2, ArrowRightCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
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

export default function IssueDetailPage() {
  const t = useTranslations('issues');
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
    resolved: { label: t('statuses.resolved'), class: statusClasses.resolved },
    closed: { label: t('statuses.closed'), class: statusClasses.closed },
  };

  const categoryConfig = {
    damage: t('categories.damage'),
    cleaning: t('categories.cleaning'),
    safety: t('categories.safety'),
    maintenance: t('categories.maintenance'),
    other: t('categories.other'),
  };
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

      // Check if any aufgaben reference this issue
      const { count } = await (supabase as any)
        .from('aufgaben')
        .select('id', { count: 'exact', head: true })
        .eq('source_meldung_id', issueId);

      if (count && count > 0) {
        throw new Error(t('detail.cannotDelete'));
      }

      // Fetch photo URLs before deleting
      const { data: issueData } = await supabase
        .from('issues')
        .select('photo_urls')
        .eq('id', issueId)
        .single();

      // Delete the issue row first
      const { error } = await supabase
        .from('issues')
        .delete()
        .eq('id', issueId);

      if (error) throw error;

      // Delete photos from storage (best-effort after issue is deleted)
      const photoUrls: string[] = (issueData as any)?.photo_urls || [];
      if (photoUrls.length > 0) {
        const storagePaths = photoUrls
          .map((url: string) => {
            const match = url.match(/\/storage\/v1\/object\/public\/photos\/([^?]+)/);
            return match ? decodeURIComponent(match[1]) : null;
          })
          .filter((path): path is string => path !== null);

        if (storagePaths.length > 0) {
          const { error: storageError } = await supabase.storage.from('photos').remove(storagePaths);
          if (storageError) {
            console.error('Failed to delete photos from storage:', storageError);
          }
        }
      }
    },
    onSuccess: async () => {
      toast.success(t('detail.deleted'));
      await queryClient.invalidateQueries({ queryKey: ['meldungen'] });
      await queryClient.invalidateQueries({ queryKey: ['open-issues-count'] });
      router.push('/issues');
    },
    onError: (error: Error) => {
      toast.error(`${tCommon('error')}: ${error.message}`);
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
      toast.success(t('detail.converted'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['meldungen'] }),
        queryClient.invalidateQueries({ queryKey: ['aufgaben'] }),
        queryClient.invalidateQueries({ queryKey: ['issue', issueId] }),
        queryClient.invalidateQueries({ queryKey: ['open-issues-count'] }),
        queryClient.invalidateQueries({ queryKey: ['new-tasks-notification-count'] }),
      ]);
      router.push('/issues');
    },
    onError: (error: Error) => {
      toast.error(`${tCommon('error')}: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <PageContainer header={<Header title={t('detail.title')} showBack />}>
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
      <PageContainer header={<Header title={t('detail.title')} showBack />}>
        <div className="text-center py-12 text-muted-foreground">
          {t('detail.notFound')}
        </div>
      </PageContainer>
    );
  }

  const priority = priorityConfig[issue.priority];
  const status = statusConfig[issue.status];

  return (
    <PageContainer
      header={<Header title={t('detail.title')} showBack backHref="/issues" />}
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
              {tCommon('description')}
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
              {t('photos')} ({issue.photo_urls.length})
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
                    alt={t('detail.photoAlt', { index: index + 1 })}
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
              <p className="text-sm text-muted-foreground">{t('detail.property')}</p>
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
              <p className="text-sm text-muted-foreground">{t('detail.reportedBy')}</p>
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
                <p className="text-sm text-muted-foreground">{t('detail.assignedTo')}</p>
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
              <p className="text-sm text-muted-foreground">{t('detail.created')}</p>
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
                <p className="text-sm text-muted-foreground">{t('detail.location')}</p>
                <a
                  href={`https://maps.google.com/?q=${issue.latitude},${issue.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  {t('detail.showOnMap')}
                </a>
              </div>
            </div>
          )}

          {/* Resolved timestamp */}
          {issue.resolved_at && (
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-success-500 mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">{t('detail.resolved')}</p>
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
            {t('detail.convertToTask')}
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
            {t('detail.deleteIssue')}
          </Button>
        </div>
      )}

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

      {/* Convert to Aufgabe dialog */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('detail.convertTitle')}</DialogTitle>
            <DialogDescription>
              {t('detail.convertConfirm')}
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
              {tCommon('cancel')}
            </Button>
            <Button
              onClick={() => convertMutation.mutate()}
              disabled={convertMutation.isPending}
            >
              {convertMutation.isPending ? t('detail.converting') : t('detail.convert')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
