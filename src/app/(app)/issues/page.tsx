'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, Filter, AlertTriangle } from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { IssueCard } from '@/components/issues/issue-card';
import { PullToRefresh } from '@/components/layout/pull-to-refresh';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useAuthStore } from '@/stores/auth-store';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { Issue, IssueWithRelations, IssueStatus, IssuePriority } from '@/types/database';

export default function IssuesPage() {
  const t = useTranslations('issues');
  const tCommon = useTranslations('common');

  const statusOptions: { value: IssueStatus | 'all'; label: string }[] = [
    { value: 'all', label: tCommon('all') },
    { value: 'open', label: t('statuses.open') },
    { value: 'in_progress', label: t('statuses.inProgress') },
    { value: 'resolved', label: t('statuses.resolved') },
    { value: 'closed', label: t('statuses.closed') },
  ];

  const priorityOptions: { value: IssuePriority | 'all'; label: string }[] = [
    { value: 'all', label: tCommon('all') },
    { value: 'urgent', label: t('priorities.urgent') },
    { value: 'high', label: t('priorities.high') },
    { value: 'medium', label: t('priorities.medium') },
    { value: 'low', label: t('priorities.low') },
  ];
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const isSuperAdmin = useAuthStore((state) => state.isSuperAdmin);
  const permissions = usePermissions();
  const [statusFilter, setStatusFilter] = useState<IssueStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | 'all'>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Fetch meldungen (issues)
  const { data: issues = [], refetch } = useQuery({
    queryKey: ['meldungen', profile?.id, statusFilter, priorityFilter, permissions.isPrivileged],
    queryFn: async () => {
      const supabase = getClient();

      let query = (supabase as any)
        .from('issues')
        .select(`
          *,
          property:properties (*),
          reporter:profiles!issues_reported_by_fkey (*),
          assignee:profiles!issues_assigned_to_fkey (*),
          organizations:organization_id(name)
        `)
        .eq('converted_to_task', false)
        .order('created_at', { ascending: false });

      // Non-privileged users only see their own meldungen
      if (!permissions.isPrivileged) {
        query = query.eq('reported_by', profile!.id);
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (priorityFilter !== 'all') {
        query = query.eq('priority', priorityFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as IssueWithRelations[];
    },
    enabled: !!profile?.id,
  });

  const handleIssueClick = (issue: Issue | IssueWithRelations) => {
    router.push(`/issues/${issue.id}`);
  };

  const handleNewIssue = () => {
    router.push('/issues/new');
  };

  const activeFilters =
    (statusFilter !== 'all' ? 1 : 0) + (priorityFilter !== 'all' ? 1 : 0);

  return (
    <PageContainer
      header={
        <Header
          title={t('title')}
          rightElement={
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={handleNewIssue}>
                <Plus className="h-5 w-5" />
              </Button>
              <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Filter className="h-5 w-5" />
                    {activeFilters > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-600 text-white text-xs rounded-full flex items-center justify-center">
                        {activeFilters}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
              <SheetContent side="bottom">
                <SheetHeader>
                  <SheetTitle>{tCommon('filter')}</SheetTitle>
                </SheetHeader>

                <div className="mt-4 space-y-6">
                  {/* Status filter */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      {tCommon('status')}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {statusOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setStatusFilter(option.value)}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                            statusFilter === option.value
                              ? 'bg-primary-600 text-white'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Priority filter */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      {tCommon('priority')}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {priorityOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setPriorityFilter(option.value)}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                            priorityFilter === option.value
                              ? 'bg-primary-600 text-white'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Clear filters */}
                  {activeFilters > 0 && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setStatusFilter('all');
                        setPriorityFilter('all');
                      }}
                    >
                      {tCommon('resetFilters')}
                    </Button>
                  )}
                </div>
              </SheetContent>
              </Sheet>
            </div>
          }
        />
      }
    >
      <PullToRefresh onRefresh={async () => { await refetch(); }}>
        {/* Active filters display */}
        {activeFilters > 0 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            {statusFilter !== 'all' && (
              <span className="badge badge-info">
                {statusOptions.find((o) => o.value === statusFilter)?.label}
              </span>
            )}
            {priorityFilter !== 'all' && (
              <span className="badge badge-info">
                {priorityOptions.find((o) => o.value === priorityFilter)?.label}
              </span>
            )}
          </div>
        )}

        {/* Meldungen list */}
        {issues.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('noIssues')}</p>
            {activeFilters > 0 && (
              <p className="text-sm mt-1">{tCommon('resetFilters')}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {issues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onClick={() => handleIssueClick(issue)}
                showProperty
                organizationName={isSuperAdmin ? (issue as any).organizations?.name : undefined}
              />
            ))}
          </div>
        )}

      </PullToRefresh>
    </PageContainer>
  );
}
