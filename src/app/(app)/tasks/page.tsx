'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, ChevronRight } from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { ChecklistProgress } from '@/components/checklist/checklist-list';
import { PullToRefresh } from '@/components/layout/pull-to-refresh';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { swissFormat } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { ChecklistTemplate, Property, ChecklistItem } from '@/types/database';

interface ChecklistWithProperty extends ChecklistTemplate {
  property: Property;
}

export default function TasksPage() {
  const profile = useAuthStore((state) => state.profile);

  // Fetch checklists for assigned properties
  const { data: checklists = [], refetch } = useQuery({
    queryKey: ['checklists', profile?.id],
    queryFn: async () => {
      const supabase = getClient();

      // First get assigned property IDs
      const { data: assignments } = await supabase
        .from('property_assignments')
        .select('property_id')
        .eq('user_id', profile!.id);

      if (!assignments || assignments.length === 0) return [];

      const propertyIds = assignments.map((a) => a.property_id);

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

  // Group by property
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

  return (
    <PageContainer
      header={<Header title="Aufgaben" />}
    >
      <PullToRefresh onRefresh={refetch}>
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
                    const items = (checklist.items as ChecklistItem[]) || [];
                    const itemCount = items.length;

                    return (
                      <Card
                        key={checklist.id}
                        interactive
                        className="cursor-pointer"
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium">{checklist.name}</h3>
                              <p className="text-sm text-muted-foreground">
                                {itemCount} {itemCount === 1 ? 'Aufgabe' : 'Aufgaben'}
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
              Wie funktionieren Checklisten?
            </h3>
            <p className="text-sm text-primary-700">
              Checklisten werden automatisch angezeigt, wenn Sie die Zeiterfassung
              bei einer Liegenschaft starten. Arbeiten Sie die Punkte während
              Ihrer Arbeit ab.
            </p>
          </CardContent>
        </Card>
      </PullToRefresh>
    </PageContainer>
  );
}
