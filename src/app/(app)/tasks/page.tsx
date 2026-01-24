'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ClipboardList,
  ListTodo,
  ChevronRight,
  Calendar,
  User,
} from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { PullToRefresh } from '@/components/layout/pull-to-refresh';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuthStore } from '@/stores/auth-store';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';
import { swissFormat } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type {
  ChecklistTemplate,
  Property,
  ChecklistItem,
  Aufgabe,
  AufgabeWithRelations,
  Profile,
} from '@/types/database';

interface ChecklistWithProperty extends ChecklistTemplate {
  property: Property;
}

type TabType = 'aufgaben' | 'checklisten';

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

export default function TasksPage() {
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const permissions = usePermissions();
  const [activeTab, setActiveTab] = useState<TabType>('aufgaben');
  const [selectedChecklist, setSelectedChecklist] = useState<ChecklistWithProperty | null>(null);

  // Fetch aufgaben
  const { data: aufgaben = [], refetch: refetchAufgaben } = useQuery({
    queryKey: ['aufgaben', profile?.id, permissions.isPrivileged],
    queryFn: async () => {
      const supabase = getClient();

      let query = supabase
        .from('aufgaben')
        .select(`
          *,
          property:properties (*),
          creator:profiles!aufgaben_created_by_fkey (*),
          assignee:profiles!aufgaben_assigned_to_fkey (*)
        `)
        .in('status', ['open', 'in_progress'])
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      // Non-privileged users only see assigned aufgaben
      if (!permissions.isPrivileged) {
        query = query.eq('assigned_to', profile!.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as AufgabeWithRelations[];
    },
    enabled: !!profile?.id,
  });

  // Fetch checklists for assigned properties
  const { data: checklists = [], refetch: refetchChecklists } = useQuery({
    queryKey: ['checklists', profile?.id],
    queryFn: async () => {
      const supabase = getClient();

      // First get assigned property IDs
      const { data: assignments } = await supabase
        .from('property_assignments')
        .select('property_id')
        .eq('user_id', profile!.id);

      if (!assignments || assignments.length === 0) return [];

      const propertyIds = (assignments as { property_id: string }[]).map((a) => a.property_id);

      // Then fetch checklists for those properties
      const { data, error } = await supabase
        .from('checklist_templates')
        .select(`
          *,
          property:properties (*)
        `)
        .in('property_id', propertyIds)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as ChecklistWithProperty[];
    },
    enabled: !!profile?.id,
  });

  const handleRefresh = async () => {
    await Promise.all([refetchAufgaben(), refetchChecklists()]);
  };

  // Group checklists by property
  const checklistsByProperty = checklists.reduce((acc, checklist) => {
    const propertyId = checklist.property_id;
    if (!acc[propertyId]) {
      acc[propertyId] = {
        property: checklist.property,
        checklists: [],
      };
    }
    acc[propertyId].checklists.push(checklist);
    return acc;
  }, {} as Record<string, { property: Property; checklists: ChecklistWithProperty[] }>);

  const renderAufgabenTab = () => (
    <>
      {aufgaben.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ListTodo className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Keine offenen Aufgaben</p>
          {permissions.canManageAufgaben && (
            <p className="text-sm mt-1">
              Wandeln Sie eine Meldung in eine Aufgabe um
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {aufgaben.map((aufgabe) => (
            <Card
              key={aufgabe.id}
              interactive
              className={cn(
                'cursor-pointer',
                aufgabe.priority === 'urgent' && 'border-error-300',
                aufgabe.priority === 'high' && 'border-warning-300'
              )}
              onClick={() => router.push(`/tasks/${aufgabe.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium line-clamp-1">{aufgabe.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {aufgabe.property?.name}
                    </p>

                    {/* Meta info */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                      {aufgabe.due_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {swissFormat.date(aufgabe.due_date)}
                        </span>
                      )}
                      {aufgabe.assignee && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {aufgabe.assignee.first_name} {aufgabe.assignee.last_name}
                        </span>
                      )}
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-2 mt-2">
                      <span className={cn('badge', statusConfig[aufgabe.status].class)}>
                        {statusConfig[aufgabe.status].label}
                      </span>
                      <span className={cn('badge', priorityConfig[aufgabe.priority].class)}>
                        {priorityConfig[aufgabe.priority].label}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );

  const renderChecklistenTab = () => (
    <>
      {Object.keys(checklistsByProperty).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Keine Checklisten vorhanden</p>
          <p className="text-sm mt-1">
            Checklisten werden beim Zeiterfassen angezeigt
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.values(checklistsByProperty).map(({ property, checklists }) => (
            <div key={property.id}>
              <h2 className="text-sm font-medium text-muted-foreground mb-2">
                {property.name}
              </h2>

              <div className="space-y-2">
                {checklists.map((checklist) => {
                  const items = (checklist.items as unknown as ChecklistItem[]) || [];
                  const itemCount = items.length;

                  return (
                    <Card
                      key={checklist.id}
                      interactive
                      className="cursor-pointer"
                      onClick={() => setSelectedChecklist(checklist)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium">{checklist.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {itemCount} {itemCount === 1 ? 'Punkt' : 'Punkte'}
                            </p>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info card */}
      <Card className="mt-6 bg-primary-50 border-primary-200">
        <CardContent className="p-4">
          <h3 className="font-medium text-primary-900 mb-1">
            Checklisten bearbeiten
          </h3>
          <p className="text-sm text-primary-700">
            Starten Sie einen Timer auf der Startseite, um die Checklisten-Punkte
            während der Arbeit abzuhaken.
          </p>
        </CardContent>
      </Card>
    </>
  );

  return (
    <PageContainer
      header={
        <Header title="Aufgaben" />
      }
    >
      <PullToRefresh onRefresh={handleRefresh}>
        {/* Tab toggle */}
        <div className="flex gap-2 mb-4 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setActiveTab('aufgaben')}
            className={cn(
              'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors',
              activeTab === 'aufgaben'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ListTodo className="h-4 w-4 inline-block mr-2" />
            Aufgaben
            {aufgaben.length > 0 && (
              <span className="ml-2 bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full text-xs">
                {aufgaben.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('checklisten')}
            className={cn(
              'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors',
              activeTab === 'checklisten'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ClipboardList className="h-4 w-4 inline-block mr-2" />
            Checklisten
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'aufgaben' ? renderAufgabenTab() : renderChecklistenTab()}
      </PullToRefresh>

      {/* Checklist detail sheet */}
      <Sheet open={!!selectedChecklist} onOpenChange={() => setSelectedChecklist(null)}>
        <SheetContent side="bottom" className="h-[70vh]">
          <SheetHeader>
            <SheetTitle>{selectedChecklist?.name}</SheetTitle>
            <p className="text-sm text-muted-foreground">
              {selectedChecklist?.property?.name}
            </p>
          </SheetHeader>

          <div className="mt-4 space-y-2 overflow-y-auto max-h-[calc(70vh-120px)]">
            {selectedChecklist &&
              ((selectedChecklist.items as unknown as ChecklistItem[]) || []).map((item, index) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center flex-shrink-0 text-sm font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-1 capitalize">
                        {item.type === 'checkbox' ? 'Checkbox' : item.type === 'text' ? 'Text' : item.type === 'number' ? 'Zahl' : 'Foto'}
                        {item.required && ' • Pflichtfeld'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}
