'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, Filter, AlertTriangle } from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { IssueList } from '@/components/issues/issue-card';
import { PullToRefresh } from '@/components/layout/pull-to-refresh';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { IssueWithRelations, IssueStatus, IssuePriority } from '@/types/database';

const statusOptions: { value: IssueStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'open', label: 'Offen' },
  { value: 'in_progress', label: 'In Bearbeitung' },
  { value: 'resolved', label: 'Gelöst' },
  { value: 'closed', label: 'Geschlossen' },
];

const priorityOptions: { value: IssuePriority | 'all'; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'urgent', label: 'Dringend' },
  { value: 'high', label: 'Hoch' },
  { value: 'medium', label: 'Mittel' },
  { value: 'low', label: 'Niedrig' },
];

export default function IssuesPage() {
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const [statusFilter, setStatusFilter] = useState<IssueStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | 'all'>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Fetch issues
  const { data: issues = [], refetch } = useQuery({
    queryKey: ['issues', profile?.id, statusFilter, priorityFilter],
    queryFn: async () => {
      const supabase = getClient();

      let query = supabase
        .from('issues')
        .select(`
          *,
          property:properties (*),
          reporter:profiles!issues_reported_by_fkey (*),
          assignee:profiles!issues_assigned_to_fkey (*)
        `)
        .eq('reported_by', profile!.id)
        .order('created_at', { ascending: false });

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

  const handleIssueClick = (issue: IssueWithRelations) => {
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
          title="Probleme"
          rightElement={
            <div className="flex gap-2">
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
                    <SheetTitle>Filter</SheetTitle>
                  </SheetHeader>

                  <div className="mt-4 space-y-6">
                    {/* Status filter */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Status
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
                        Priorität
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
                        Filter zurücksetzen
                      </Button>
                    )}
                  </div>
                </SheetContent>
              </Sheet>

              <Button size="icon" onClick={handleNewIssue}>
                <Plus className="h-5 w-5" />
              </Button>
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

        {/* Issues list */}
        {issues.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Keine Probleme gefunden</p>
            {activeFilters > 0 && (
              <p className="text-sm mt-1">Versuchen Sie andere Filter</p>
            )}
          </div>
        ) : (
          <IssueList
            issues={issues}
            onIssueClick={handleIssueClick}
            showProperty
          />
        )}

        {/* Floating action button for mobile */}
        <button
          onClick={handleNewIssue}
          className="fixed bottom-24 right-4 w-14 h-14 bg-primary-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-primary-700 active:scale-95 transition-all"
          aria-label="Neues Problem melden"
        >
          <Plus className="h-6 w-6" />
        </button>
      </PullToRefresh>
    </PageContainer>
  );
}
