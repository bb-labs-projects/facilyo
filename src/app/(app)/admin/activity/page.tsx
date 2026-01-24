'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ClipboardList,
  Building2,
  User,
  Calendar,
  ChevronRight,
  Check,
  Type,
  Hash,
  Camera,
  X,
  Filter,
} from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { usePermissions } from '@/hooks/use-permissions';
import { getClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type {
  Property,
  Profile,
  ChecklistItem,
  ChecklistItemType,
} from '@/types/database';

type TabType = 'aufgaben' | 'checklists';

interface AufgabeWithRelations {
  id: string;
  title: string;
  description: string | null;
  status: string;
  completed_at: string | null;
  completed_by: string | null;
  property_id: string;
  property: Property;
  completer: Profile | null;
}

interface ChecklistInstanceWithRelations {
  id: string;
  template_id: string;
  time_entry_id: string;
  completed_items: Record<string, unknown>;
  updated_at: string;
  created_at: string;
  template: {
    name: string;
    items: ChecklistItem[];
    property: Property;
  };
  time_entry: {
    user_id: string;
    user: Profile;
    property: Property;
  };
}

const itemTypeConfig: Record<ChecklistItemType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  checkbox: { label: 'Checkbox', icon: Check },
  text: { label: 'Text', icon: Type },
  number: { label: 'Zahl', icon: Hash },
  photo: { label: 'Foto', icon: Camera },
};

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatName(profile: Profile | null): string {
  if (!profile) return 'Unbekannt';
  const parts = [profile.first_name, profile.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : profile.email;
}

export default function AdminActivityPage() {
  const router = useRouter();
  const permissions = usePermissions();
  const [activeTab, setActiveTab] = useState<TabType>('aufgaben');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedChecklist, setSelectedChecklist] = useState<ChecklistInstanceWithRelations | null>(null);

  // Fetch all properties for filter
  const { data: properties = [] } = useQuery({
    queryKey: ['all-properties'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as Property[];
    },
  });

  // Fetch completed Aufgaben
  const { data: aufgaben = [], isLoading: isLoadingAufgaben } = useQuery({
    queryKey: ['admin-completed-aufgaben', selectedPropertyId],
    queryFn: async () => {
      const supabase = getClient();
      let query = supabase
        .from('aufgaben')
        .select(`
          *,
          property:properties (*),
          completer:profiles!aufgaben_completed_by_fkey (*)
        `)
        .eq('status', 'resolved')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false });

      if (selectedPropertyId) {
        query = query.eq('property_id', selectedPropertyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AufgabeWithRelations[];
    },
  });

  // Fetch checklist instances
  const { data: checklistInstances = [], isLoading: isLoadingChecklists } = useQuery({
    queryKey: ['admin-checklist-instances', selectedPropertyId],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('checklist_instances')
        .select(`
          *,
          template:checklist_templates (
            name,
            items,
            property:properties (*)
          ),
          time_entry:time_entries (
            user_id,
            user:profiles (*),
            property:properties (*)
          )
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Filter by property if selected
      let results = data as ChecklistInstanceWithRelations[];
      if (selectedPropertyId) {
        results = results.filter(
          (instance) => instance.template?.property?.id === selectedPropertyId
        );
      }

      return results;
    },
  });

  const getCompletedItemsCount = (instance: ChecklistInstanceWithRelations): { completed: number; total: number } => {
    const items = (instance.template?.items as unknown as ChecklistItem[]) || [];
    const completedItems = instance.completed_items || {};

    const completed = items.filter((item) => {
      const value = completedItems[item.id];
      if (item.type === 'checkbox') return value === true;
      if (item.type === 'text') return typeof value === 'string' && value.trim() !== '';
      if (item.type === 'number') return typeof value === 'number' || (typeof value === 'string' && value !== '');
      if (item.type === 'photo') return typeof value === 'string' && value !== '';
      return false;
    }).length;

    return { completed, total: items.length };
  };

  const isLoading = activeTab === 'aufgaben' ? isLoadingAufgaben : isLoadingChecklists;

  // Redirect if no permission
  if (!permissions.canAccessAdminPanel) {
    router.push('/');
    return null;
  }

  return (
    <PageContainer
      header={
        <Header
          title="Aktivitäten"
          showBack
          rightElement={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(selectedPropertyId && 'text-primary-600')}
            >
              <Filter className="h-5 w-5" />
            </Button>
          }
        />
      }
    >
      {/* Filter Section */}
      {showFilters && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <label className="text-sm font-medium block mb-2">Liegenschaft</label>
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Alle Liegenschaften</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('aufgaben')}
          className={cn(
            'flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors',
            activeTab === 'aufgaben'
              ? 'bg-primary-600 text-white'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          <CheckCircle2 className="h-4 w-4 inline-block mr-2" />
          Aufgaben
        </button>
        <button
          onClick={() => setActiveTab('checklists')}
          className={cn(
            'flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors',
            activeTab === 'checklists'
              ? 'bg-primary-600 text-white'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          <ClipboardList className="h-4 w-4 inline-block mr-2" />
          Checklisten
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Wird geladen...
        </div>
      ) : activeTab === 'aufgaben' ? (
        // Aufgaben Tab
        aufgaben.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Keine erledigten Aufgaben vorhanden</p>
          </div>
        ) : (
          <div className="space-y-3">
            {aufgaben.map((aufgabe) => (
              <Card key={aufgabe.id}>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-success-100 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="h-5 w-5 text-success-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">{aufgabe.title}</h3>
                        {aufgabe.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                            {aufgabe.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground pl-13">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" />
                        <span>{aufgabe.property?.name || 'Unbekannt'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" />
                        <span>{formatName(aufgabe.completer)}</span>
                      </div>
                      {aufgabe.completed_at && (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{formatDateTime(aufgabe.completed_at)}</span>
                        </div>
                      )}
                    </div>

                    <div className="pl-13">
                      <span className="badge badge-success text-xs">Erledigt</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        // Checklists Tab
        checklistInstances.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Keine Checklisten-Erledigungen vorhanden</p>
          </div>
        ) : (
          <div className="space-y-3">
            {checklistInstances.map((instance) => {
              const progress = getCompletedItemsCount(instance);
              const propertyName = instance.template?.property?.name || instance.time_entry?.property?.name || 'Unbekannt';
              const userName = formatName(instance.time_entry?.user);

              return (
                <Card
                  key={instance.id}
                  interactive
                  className="cursor-pointer"
                  onClick={() => setSelectedChecklist(instance)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <ClipboardList className="h-5 w-5 text-primary-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">
                          {instance.template?.name || 'Unbekannte Checkliste'}
                        </h3>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground mt-0.5">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5" />
                            <span>{propertyName}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" />
                            <span>{userName}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>{formatDateTime(instance.updated_at)}</span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {progress.completed}/{progress.total} Punkte erledigt
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* Checklist Detail Sheet */}
      <Sheet open={!!selectedChecklist} onOpenChange={() => setSelectedChecklist(null)}>
        <SheetContent side="bottom" className="h-[85vh]">
          {selectedChecklist && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedChecklist.template?.name || 'Checkliste'}</SheetTitle>
                <p className="text-sm text-muted-foreground">
                  {formatName(selectedChecklist.time_entry?.user)} • {formatDateTime(selectedChecklist.updated_at)}
                </p>
              </SheetHeader>

              <div className="mt-6 space-y-4 overflow-y-auto max-h-[calc(85vh-120px)]">
                {(selectedChecklist.template?.items as unknown as ChecklistItem[])?.map((item) => {
                  const value = selectedChecklist.completed_items?.[item.id];
                  const TypeIcon = itemTypeConfig[item.type]?.icon || Check;
                  const hasValue = item.type === 'checkbox'
                    ? value === true
                    : item.type === 'photo'
                    ? typeof value === 'string' && value !== ''
                    : value !== undefined && value !== '' && value !== null;

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'p-4 rounded-lg border',
                        hasValue ? 'bg-success-50 border-success-200' : 'bg-muted border-muted'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0',
                            hasValue ? 'bg-success-500' : 'bg-muted-foreground/30'
                          )}
                        >
                          {hasValue ? (
                            <Check className="h-4 w-4 text-white" />
                          ) : (
                            <X className="h-4 w-4 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <TypeIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{item.label}</span>
                          </div>

                          {/* Display value based on type */}
                          {hasValue && (
                            <div className="mt-2">
                              {item.type === 'checkbox' && (
                                <span className="text-sm text-success-700">Ja</span>
                              )}
                              {item.type === 'text' && (
                                <p className="text-sm text-muted-foreground bg-white p-2 rounded border">
                                  {value as string}
                                </p>
                              )}
                              {item.type === 'number' && (
                                <span className="text-sm font-mono bg-white px-2 py-1 rounded border">
                                  {value as number}
                                </span>
                              )}
                              {item.type === 'photo' && typeof value === 'string' && (
                                <img
                                  src={value}
                                  alt={item.label}
                                  className="mt-2 w-full max-w-xs rounded-lg border"
                                />
                              )}
                            </div>
                          )}

                          {!hasValue && (
                            <span className="text-sm text-muted-foreground">Nicht ausgefüllt</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {(!selectedChecklist.template?.items || (selectedChecklist.template.items as unknown as ChecklistItem[]).length === 0) && (
                  <p className="text-center text-muted-foreground py-4">
                    Keine Checklistenpunkte vorhanden
                  </p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}
