'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Repeat, Play, CheckCircle, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import type { Client, ClientSubscription, SubscriptionInterval } from '@/types/database';

interface BulkPreviewItem {
  subscription_id: string;
  subscription_name: string;
  client_name: string;
  interval: SubscriptionInterval;
  period_amount: number;
  period_start: string;
  period_end: string;
  status: 'eligible' | 'skipped';
  skip_reason?: string;
}

interface BulkCreateResult {
  created: number;
  skipped: number;
  details: Array<{ invoice_id: string; invoice_number: string; client_name: string; total: number }>;
  skipped_details: Array<{ subscription_name: string; client_name: string; reason: string }>;
}

const INTERVAL_LABELS: Record<SubscriptionInterval, string> = {
  monthly: 'Monatlich',
  quarterly: 'Quartalsweise',
  half_yearly: 'Halbjährlich',
  annually: 'Jährlich',
};

function getPeriodAmount(yearly: number, interval: SubscriptionInterval): number {
  switch (interval) {
    case 'monthly': return yearly / 12;
    case 'quarterly': return yearly / 4;
    case 'half_yearly': return yearly / 2;
    case 'annually': return yearly;
  }
}

type SubWithClient = ClientSubscription & { clients: { name: string } | null };

export function InvoiceSubscriptions() {
  const queryClient = useQueryClient();
  const organizationId = useAuthStore((state) => state.organizationId);

  const [showForm, setShowForm] = useState(false);
  const [editingSub, setEditingSub] = useState<SubWithClient | null>(null);
  const [clientId, setClientId] = useState('');
  const [subName, setSubName] = useState('');
  const [subDescription, setSubDescription] = useState('');
  const [subYearlyAmount, setSubYearlyAmount] = useState('');
  const [subInterval, setSubInterval] = useState<SubscriptionInterval>('monthly');
  const [subNextBillingDate, setSubNextBillingDate] = useState('');
  const [subIsActive, setSubIsActive] = useState(true);

  // Bulk invoice run state
  const [showBulkRun, setShowBulkRun] = useState(false);
  const [bulkPeriodEnd, setBulkPeriodEnd] = useState('');
  const [bulkPreview, setBulkPreview] = useState<BulkPreviewItem[] | null>(null);
  const [bulkPreviewLoading, setBulkPreviewLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkCreateResult | null>(null);

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
        if (refreshError) {
          throw new Error('Sitzung abgelaufen. Bitte melden Sie sich erneut an.');
        }
      }
      lastSessionCheck.current = now;
    } finally {
      sessionRefreshLock.current = false;
    }
  };

  // Fetch all subscriptions with client name
  const { data: subscriptions = [], isLoading } = useQuery({
    queryKey: ['all-subscriptions'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('client_subscriptions')
        .select('*, clients(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as SubWithClient[];
    },
    enabled: !!organizationId,
  });

  // Fetch active clients for dropdown
  const { data: clients = [] } = useQuery({
    queryKey: ['admin-invoice-clients'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('clients')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as Pick<Client, 'id' | 'name'>[];
    },
    enabled: !!organizationId,
  });

  const resetForm = () => {
    setClientId('');
    setSubName('');
    setSubDescription('');
    setSubYearlyAmount('');
    setSubInterval('monthly');
    setSubNextBillingDate('');
    setSubIsActive(true);
    setEditingSub(null);
    setShowForm(false);
  };

  const openEditForm = (sub: SubWithClient) => {
    setClientId(sub.client_id);
    setSubName(sub.name);
    setSubDescription(sub.description || '');
    setSubYearlyAmount(String(sub.yearly_amount));
    setSubInterval(sub.interval);
    setSubNextBillingDate(sub.next_billing_date || '');
    setSubIsActive(sub.is_active);
    setEditingSub(sub);
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: { client_id: string; name: string; description: string | null; yearly_amount: number; interval: SubscriptionInterval; next_billing_date: string | null; is_active: boolean }) => {
      const supabase = getClient();
      await ensureValidSession();

      if (editingSub) {
        const { client_id: _cid, ...updateData } = data;
        const { error } = await (supabase as any)
          .from('client_subscriptions')
          .update(updateData)
          .eq('id', editingSub.id);

        if (error) {
          if (error.code === '42501' || error.message?.includes('permission') || error.code === 'PGRST301') {
            await supabase.auth.refreshSession();
            const { error: retryError } = await (supabase as any)
              .from('client_subscriptions')
              .update(updateData)
              .eq('id', editingSub.id);
            if (retryError) throw retryError;
            return;
          }
          throw error;
        }
      } else {
        const { error } = await (supabase as any)
          .from('client_subscriptions')
          .insert({
            ...data,
            organization_id: organizationId,
          });

        if (error) {
          if (error.code === '42501' || error.message?.includes('permission') || error.code === 'PGRST301') {
            await supabase.auth.refreshSession();
            const { error: retryError } = await (supabase as any)
              .from('client_subscriptions')
              .insert({
                ...data,
                organization_id: organizationId,
              });
            if (retryError) throw retryError;
            return;
          }
          throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(editingSub ? 'Abonnement aktualisiert' : 'Abonnement erstellt');
      queryClient.invalidateQueries({ queryKey: ['all-subscriptions'] });
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (subId: string) => {
      const supabase = getClient();
      await ensureValidSession();
      const { error } = await (supabase as any)
        .from('client_subscriptions')
        .delete()
        .eq('id', subId);

      if (error) {
        if (error.code === '42501' || error.message?.includes('permission') || error.code === 'PGRST301') {
          await supabase.auth.refreshSession();
          const { error: retryError } = await (supabase as any)
            .from('client_subscriptions')
            .delete()
            .eq('id', subId);
          if (retryError) throw retryError;
          return;
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Abonnement gelöscht');
      queryClient.invalidateQueries({ queryKey: ['all-subscriptions'] });
    },
    onError: (error: Error) => {
      toast.error(`Fehler: ${error.message}`);
    },
  });

  const resetBulkRun = () => {
    setBulkPeriodEnd('');
    setBulkPreview(null);
    setBulkResult(null);
    setShowBulkRun(false);
  };

  const loadBulkPreview = async () => {
    if (!bulkPeriodEnd) return;
    setBulkPreviewLoading(true);
    setBulkPreview(null);
    try {
      const supabase = getClient();
      await ensureValidSession();

      // Fetch eligible subscriptions
      const { data: subs, error: subError } = await (supabase as any)
        .from('client_subscriptions')
        .select('*, clients(name)')
        .eq('is_active', true)
        .not('next_billing_date', 'is', null)
        .lte('next_billing_date', bulkPeriodEnd);

      if (subError) throw subError;

      const preview: BulkPreviewItem[] = [];
      for (const sub of (subs || [])) {
        const periodAmount = getPeriodAmount(sub.yearly_amount, sub.interval);
        const start = new Date(sub.next_billing_date);
        const periodStart = new Date(start.getFullYear(), start.getMonth(), 1);
        const monthsMap = { monthly: 1, quarterly: 3, half_yearly: 6, annually: 12 } as const;
        const periodEnd = new Date(start.getFullYear(), start.getMonth() + monthsMap[sub.interval as SubscriptionInterval], 0);
        const pStart = periodStart.toISOString().split('T')[0];
        const pEnd = periodEnd.toISOString().split('T')[0];

        // Check for existing invoices
        const { data: existing } = await (supabase as any)
          .from('invoice_line_items')
          .select('id, invoice_id, invoices!inner(status)')
          .eq('subscription_id', sub.id)
          .neq('invoices.status', 'cancelled')
          .lte('period_start', pEnd)
          .gte('period_end', pStart);

        preview.push({
          subscription_id: sub.id,
          subscription_name: sub.name,
          client_name: sub.clients?.name || 'Unbekannt',
          interval: sub.interval,
          period_amount: Math.round(periodAmount * 100) / 100,
          period_start: pStart,
          period_end: pEnd,
          status: existing && existing.length > 0 ? 'skipped' : 'eligible',
          skip_reason: existing && existing.length > 0 ? 'Bereits abgerechnet' : undefined,
        });
      }
      setBulkPreview(preview);
    } catch (error: any) {
      toast.error(`Fehler beim Laden der Vorschau: ${error.message}`);
    } finally {
      setBulkPreviewLoading(false);
    }
  };

  const bulkCreateMutation = useMutation({
    mutationFn: async () => {
      await ensureValidSession();
      const res = await fetch('/api/invoices/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billing_period_end: bulkPeriodEnd }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Fehler beim Erstellen der Rechnungen');
      }
      return await res.json() as BulkCreateResult;
    },
    onSuccess: (data) => {
      setBulkResult(data);
      if (data.created > 0) {
        toast.success(`${data.created} Rechnung(en) erstellt`);
        queryClient.invalidateQueries({ queryKey: ['all-subscriptions'] });
        queryClient.invalidateQueries({ queryKey: ['admin-invoices'] });
      } else {
        toast.info('Keine Rechnungen erstellt');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Wird geladen...
      </div>
    );
  }

  return (
    <>
      {subscriptions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Repeat className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Keine Abonnements vorhanden</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setShowForm(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Neues Abonnement
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Button
            onClick={() => setShowBulkRun(true)}
            className="w-full"
          >
            <Play className="h-4 w-4 mr-2" />
            Rechnungslauf starten
          </Button>
          <Button
            onClick={() => setShowForm(true)}
            className="w-full"
            variant="outline"
          >
            <Plus className="h-4 w-4 mr-2" />
            Neues Abonnement
          </Button>

          {subscriptions.map((sub) => (
            <Card key={sub.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-medium">{sub.name}</h4>
                      {sub.is_active ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Aktiv
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          Inaktiv
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {sub.clients?.name}
                    </p>
                    <p className="text-sm font-semibold text-primary-600 mt-0.5">
                      CHF {sub.yearly_amount.toFixed(2)} / Jahr
                    </p>
                    <p className="text-xs text-muted-foreground">
                      CHF {getPeriodAmount(sub.yearly_amount, sub.interval).toFixed(2)} / {INTERVAL_LABELS[sub.interval]}
                    </p>
                    {sub.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">{sub.description}</p>
                    )}
                    {sub.next_billing_date && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Nächste Abrechnung: {new Date(sub.next_billing_date).toLocaleDateString('de-CH')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditForm(sub)}
                      title="Bearbeiten"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(sub.id)}
                      disabled={deleteMutation.isPending}
                      title="Löschen"
                      className="text-error-500 hover:text-error-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Subscription form sheet */}
      <Sheet open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <SheetContent side="bottom" className="h-[85vh]">
          <SheetHeader>
            <SheetTitle>
              {editingSub ? 'Abonnement bearbeiten' : 'Neues Abonnement'}
            </SheetTitle>
          </SheetHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate({
                client_id: clientId,
                name: subName.trim(),
                description: subDescription.trim() || null,
                yearly_amount: parseFloat(subYearlyAmount),
                interval: subInterval,
                next_billing_date: subNextBillingDate || null,
                is_active: subIsActive,
              });
            }}
            className="mt-4 space-y-4 overflow-y-auto max-h-[calc(85vh-120px)]"
          >
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Kunde <span className="text-error-500">*</span>
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={!!editingSub}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Kunde auswählen...</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Name <span className="text-error-500">*</span>
              </label>
              <Input
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="z.B. Hauswartung Monatspauschale"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Beschreibung</label>
              <Input
                value={subDescription}
                onChange={(e) => setSubDescription(e.target.value)}
                placeholder="Optionale Beschreibung"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Jahresbetrag (CHF) <span className="text-error-500">*</span>
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={subYearlyAmount}
                  onChange={(e) => setSubYearlyAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Intervall</label>
                <select
                  value={subInterval}
                  onChange={(e) => setSubInterval(e.target.value as SubscriptionInterval)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="monthly">Monatlich</option>
                  <option value="quarterly">Quartalsweise</option>
                  <option value="half_yearly">Halbjährlich</option>
                  <option value="annually">Jährlich</option>
                </select>
              </div>
            </div>

            {subYearlyAmount && parseFloat(subYearlyAmount) > 0 && (
              <p className="text-sm text-muted-foreground">
                Rechnungsbetrag pro Periode: CHF {getPeriodAmount(parseFloat(subYearlyAmount), subInterval).toFixed(2)}
              </p>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Nächstes Abrechnungsdatum</label>
              <Input
                type="date"
                value={subNextBillingDate}
                onChange={(e) => setSubNextBillingDate(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={subIsActive}
                onChange={(e) => setSubIsActive(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span>Aktiv</span>
            </label>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={resetForm}
              >
                Abbrechen
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={saveMutation.isPending || !subName.trim() || !subYearlyAmount || !clientId}
              >
                {saveMutation.isPending
                  ? 'Wird gespeichert...'
                  : editingSub
                  ? 'Speichern'
                  : 'Erstellen'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Bulk invoice run sheet */}
      <Sheet open={showBulkRun} onOpenChange={(open) => !open && resetBulkRun()}>
        <SheetContent side="bottom" className="h-[85vh]">
          <SheetHeader>
            <SheetTitle>Rechnungslauf</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4 overflow-y-auto max-h-[calc(85vh-120px)]">
            {!bulkResult ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Abrechnungsperiode bis
                  </label>
                  <Input
                    type="date"
                    value={bulkPeriodEnd}
                    onChange={(e) => {
                      setBulkPeriodEnd(e.target.value);
                      setBulkPreview(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Alle aktiven Abonnements mit Abrechnungsdatum bis zu diesem Datum werden einbezogen.
                  </p>
                </div>

                <Button
                  onClick={loadBulkPreview}
                  disabled={!bulkPeriodEnd || bulkPreviewLoading}
                  variant="outline"
                  className="w-full"
                >
                  {bulkPreviewLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Wird geladen...
                    </>
                  ) : (
                    'Vorschau laden'
                  )}
                </Button>

                {bulkPreview && (
                  <>
                    {bulkPreview.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        Keine Abonnements zur Abrechnung gefunden.
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {bulkPreview.map((item) => (
                            <Card key={item.subscription_id}>
                              <CardContent className="p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm">{item.subscription_name}</span>
                                      {item.status === 'eligible' ? (
                                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                          Wird abgerechnet
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                          Uebersprungen
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">{item.client_name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(item.period_start).toLocaleDateString('de-CH')} - {new Date(item.period_end).toLocaleDateString('de-CH')}
                                    </p>
                                    {item.skip_reason && (
                                      <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                                        <AlertCircle className="h-3 w-3" />
                                        {item.skip_reason}
                                      </p>
                                    )}
                                  </div>
                                  <span className="text-sm font-semibold whitespace-nowrap">
                                    CHF {item.period_amount.toFixed(2)}
                                  </span>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>

                        <div className="flex gap-3 pt-2">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={resetBulkRun}
                          >
                            Abbrechen
                          </Button>
                          <Button
                            className="flex-1"
                            onClick={() => bulkCreateMutation.mutate()}
                            disabled={bulkCreateMutation.isPending || bulkPreview.filter(i => i.status === 'eligible').length === 0}
                          >
                            {bulkCreateMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Wird erstellt...
                              </>
                            ) : (
                              `${bulkPreview.filter(i => i.status === 'eligible').length} Rechnung(en) erstellen`
                            )}
                          </Button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">
                    {bulkResult.created} Rechnung(en) erstellt
                    {bulkResult.skipped > 0 && `, ${bulkResult.skipped} uebersprungen`}
                  </span>
                </div>

                {bulkResult.details.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Erstellte Rechnungen:</h4>
                    {bulkResult.details.map((inv) => (
                      <Card key={inv.invoice_id}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="font-medium text-sm">{inv.invoice_number}</span>
                              <p className="text-xs text-muted-foreground">{inv.client_name}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">CHF {inv.total.toFixed(2)}</span>
                              <a
                                href={`/admin/invoices/${inv.invoice_id}`}
                                className="text-primary-600 hover:text-primary-700"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {bulkResult.skipped_details.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Uebersprungen:</h4>
                    {bulkResult.skipped_details.map((skip, i) => (
                      <div key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 text-amber-500" />
                        {skip.subscription_name} ({skip.client_name}) - {skip.reason}
                      </div>
                    ))}
                  </div>
                )}

                <Button onClick={resetBulkRun} className="w-full">
                  Schliessen
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
