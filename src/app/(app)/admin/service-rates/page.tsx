'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, DollarSign } from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { ErrorBoundary } from '@/components/error-boundary';
import type { ServiceRate } from '@/types/database';

const ACTIVITY_TYPES = [
  { key: 'hauswartung', label: 'Hauswartung' },
  { key: 'rasen_maehen', label: 'Rasen mähen' },
  { key: 'hecken_schneiden', label: 'Hecken schneiden' },
  { key: 'regie', label: 'Regie' },
  { key: 'reinigung', label: 'Reinigung' },
] as const;

export default function AdminServiceRatesPage() {
  return (
    <ErrorBoundary>
      <AdminServiceRatesPageContent />
    </ErrorBoundary>
  );
}

function AdminServiceRatesPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const organizationId = useAuthStore((state) => state.organizationId);

  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [hourlyRate, setHourlyRate] = useState('');
  const [description, setDescription] = useState('');

  // Session refresh helpers
  const sessionRefreshLock = useRef(false);
  const lastSessionCheck = useRef(0);

  const ensureValidSession = async () => {
    const now = Date.now();
    if (now - lastSessionCheck.current < 5000) return;
    if (sessionRefreshLock.current) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return;
    }
    sessionRefreshLock.current = true;
    try {
      const supabase = getClient();
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) throw new Error('Sitzung abgelaufen.');
      }
      lastSessionCheck.current = now;
    } finally {
      sessionRefreshLock.current = false;
    }
  };

  // Fetch existing service rates for this org
  const { data: serviceRates = [], isLoading } = useQuery({
    queryKey: ['service-rates', organizationId],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('service_rates')
        .select('*')
        .order('activity_type');

      if (error) throw error;
      return data as ServiceRate[];
    },
    enabled: !!organizationId,
  });

  // Build a map for quick lookup: activity_type -> ServiceRate
  const ratesByType: Record<string, ServiceRate> = {};
  for (const rate of serviceRates) {
    ratesByType[rate.activity_type] = rate;
  }

  // Open the edit sheet for an activity type
  const openEdit = (activityKey: string) => {
    const existing = ratesByType[activityKey];
    setSelectedType(activityKey);
    setHourlyRate(existing ? String(existing.hourly_rate) : '');
    setDescription(existing?.description ?? '');
  };

  const closeSheet = () => {
    setSelectedType(null);
    setHourlyRate('');
    setDescription('');
  };

  // Upsert mutation
  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId || !selectedType) throw new Error('Fehlende Daten.');
      const supabase = getClient();
      await ensureValidSession();

      const { error } = await (supabase as any)
        .from('service_rates')
        .upsert({
          organization_id: organizationId,
          activity_type: selectedType,
          hourly_rate: parseFloat(hourlyRate),
          description: description.trim() || null,
          is_active: true,
        }, { onConflict: 'organization_id,activity_type' });

      if (error) {
        if (error.code === '42501' || error.message?.includes('permission') || error.code === 'PGRST301') {
          await supabase.auth.refreshSession();
          const { error: retryError } = await (supabase as any)
            .from('service_rates')
            .upsert({
              organization_id: organizationId,
              activity_type: selectedType,
              hourly_rate: parseFloat(hourlyRate),
              description: description.trim() || null,
              is_active: true,
            }, { onConflict: 'organization_id,activity_type' });
          if (retryError) throw retryError;
          return;
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Stundenansatz gespeichert');
      queryClient.invalidateQueries({ queryKey: ['service-rates', organizationId] });
      closeSheet();
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hourlyRate || isNaN(parseFloat(hourlyRate)) || parseFloat(hourlyRate) <= 0) {
      toast.error('Bitte einen gültigen Stundenansatz eingeben.');
      return;
    }
    upsertMutation.mutate();
  };

  // Redirect if no permission
  useEffect(() => {
    if (!permissions.canManageInvoices) {
      router.push('/admin');
    }
  }, [permissions.canManageInvoices, router]);

  if (!permissions.canManageInvoices) {
    return null;
  }

  // Find the label for the currently selected type
  const selectedTypeLabel = ACTIVITY_TYPES.find(t => t.key === selectedType)?.label ?? '';

  return (
    <PageContainer header={<Header title="Stundenansätze" />}>
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Wird geladen...
        </div>
      ) : (
        <div className="space-y-3">
          {ACTIVITY_TYPES.map((type) => {
            const rate = ratesByType[type.key];
            return (
              <Card key={type.key}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <DollarSign className="h-5 w-5 text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium">{type.label}</h3>
                      {rate ? (
                        <>
                          <p className="text-sm text-foreground mt-0.5">
                            CHF {rate.hourly_rate.toFixed(2)} / Std
                          </p>
                          {rate.description && (
                            <p className="text-sm text-muted-foreground mt-0.5 truncate">
                              {rate.description}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Nicht konfiguriert
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0"
                      onClick={() => openEdit(type.key)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Sheet */}
      <Sheet open={!!selectedType} onOpenChange={(open) => { if (!open) closeSheet(); }}>
        <SheetContent side="bottom" className="h-[50vh]">
          <SheetHeader>
            <SheetTitle>{selectedTypeLabel}</SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSave} className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium block mb-2">
                Stundenansatz (CHF) *
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="z.B. 85.00"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">
                Beschreibung
              </label>
              <Input
                type="text"
                placeholder="Optionale Beschreibung"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={upsertMutation.isPending}
            >
              {upsertMutation.isPending ? 'Wird gespeichert...' : 'Speichern'}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}
