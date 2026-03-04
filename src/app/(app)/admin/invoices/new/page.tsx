'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/error-boundary';
import type {
  Client,
  ClientSubscription,
  ServiceRate,
  ClientRateOverride,
  TimeEntry,
  SubscriptionInterval,
  InvoiceLineItemType,
  ActivityType,
} from '@/types/database';
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Check,
  Clock,
  FileText,
  User,
  Calendar,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTIVITY_LABELS: Record<string, string> = {
  hauswartung: 'Hauswartung',
  rasen_maehen: 'Rasen mähen',
  hecken_schneiden: 'Hecken schneiden',
  regie: 'Regie',
  reinigung: 'Reinigung',
};

const INTERVAL_LABELS: Record<SubscriptionInterval, string> = {
  monthly: 'Monatlich',
  quarterly: 'Quartalsweise',
  half_yearly: 'Halbjährlich',
  annually: 'Jährlich',
};

const ACTIVITY_TYPES: ActivityType[] = [
  'hauswartung',
  'rasen_maehen',
  'hecken_schneiden',
  'regie',
  'reinigung',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatInvoiceNumber(prefix: string, num: number): string {
  return `${prefix}-${String(num).padStart(4, '0')}`;
}

function calculateHours(entry: TimeEntry): number {
  if (!entry.end_time) return 0;
  const start = new Date(entry.start_time).getTime();
  const end = new Date(entry.end_time).getTime();
  const pauseMs = (entry.pause_duration || 0) * 60 * 1000;
  return Math.max(0, (end - start - pauseMs) / (1000 * 60 * 60));
}

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Types for the form
// ---------------------------------------------------------------------------

interface SubscriptionLineItem {
  subscription_id: string;
  description: string;
  amount: number;
  interval: SubscriptionInterval;
  period_start: string;
  period_end: string;
  selected: boolean;
}

interface HoursGroup {
  activity_type: ActivityType;
  totalHours: number;
  rate: number;
  timeEntryIds: string[];
}

interface ManualLineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NewInvoicePage() {
  return (
    <ErrorBoundary>
      <NewInvoicePageContent />
    </ErrorBoundary>
  );
}

function NewInvoicePageContent() {
  const router = useRouter();
  const permissions = usePermissions();
  const organizationId = useAuthStore((state) => state.organizationId);
  const user = useAuthStore((state) => state.user);

  // -----------------------------------------------------------------------
  // Session refresh
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------
  const [step, setStep] = useState(1);

  // Step 1 — client selection
  const [selectedClientId, setSelectedClientId] = useState<string>('');

  // Invoice header fields
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState(formatDate(new Date()));
  const [dueDate, setDueDate] = useState('');

  // Step 2 — tab selection
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'hours' | 'manual'>('subscriptions');

  // Subscriptions
  const [subscriptionItems, setSubscriptionItems] = useState<SubscriptionLineItem[]>([]);

  // Hours
  const [hoursStartDate, setHoursStartDate] = useState('');
  const [hoursEndDate, setHoursEndDate] = useState('');
  const [hoursActivityFilter, setHoursActivityFilter] = useState<string>('all');
  const [hoursGroups, setHoursGroups] = useState<HoursGroup[]>([]);
  const [hoursGroupsBuilt, setHoursGroupsBuilt] = useState(false);

  // Manual
  const [manualItems, setManualItems] = useState<ManualLineItem[]>([]);

  // Step 3 — preview
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // -----------------------------------------------------------------------
  // Data queries
  // -----------------------------------------------------------------------

  // Active clients
  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ['invoice-clients'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('clients')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Client[];
    },
  });

  // Billing settings
  const { data: billingSettings } = useQuery({
    queryKey: ['billing-settings', organizationId],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('organization_billing_settings')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return data as {
        invoice_number_prefix: string;
        next_invoice_number: number;
        payment_terms_days: number;
        mwst_enabled: boolean;
        mwst_rate: number;
      } | null;
    },
    enabled: !!organizationId,
  });

  // Client subscriptions (when client selected)
  const { data: clientSubscriptions = [] } = useQuery({
    queryKey: ['invoice-client-subscriptions', selectedClientId],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('client_subscriptions')
        .select('*')
        .eq('client_id', selectedClientId)
        .eq('is_active', true);
      if (error) throw error;
      return data as ClientSubscription[];
    },
    enabled: !!selectedClientId,
  });

  // Service rates (org defaults)
  const { data: serviceRates = [] } = useQuery({
    queryKey: ['invoice-service-rates'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('service_rates')
        .select('*')
        .eq('is_active', true);
      if (error) throw error;
      return data as ServiceRate[];
    },
  });

  // Client rate overrides
  const { data: clientRateOverrides = [] } = useQuery({
    queryKey: ['invoice-client-rate-overrides', selectedClientId],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('client_rate_overrides')
        .select('*')
        .eq('client_id', selectedClientId);
      if (error) throw error;
      return data as ClientRateOverride[];
    },
    enabled: !!selectedClientId,
  });

  // Properties for client
  const { data: clientPropertyIds = [] } = useQuery({
    queryKey: ['invoice-client-properties', selectedClientId],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('properties')
        .select('id')
        .eq('client_id', selectedClientId);
      if (error) throw error;
      return (data as { id: string }[]).map((p) => p.id);
    },
    enabled: !!selectedClientId,
  });

  // Time entries for the client's properties
  const { data: allTimeEntries = [] } = useQuery({
    queryKey: ['invoice-time-entries', selectedClientId, clientPropertyIds],
    queryFn: async () => {
      if (clientPropertyIds.length === 0) return [];
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('time_entries')
        .select('*')
        .in('property_id', clientPropertyIds)
        .eq('entry_type', 'property')
        .eq('status', 'completed')
        .not('end_time', 'is', null);
      if (error) throw error;
      return data as TimeEntry[];
    },
    enabled: clientPropertyIds.length > 0,
  });

  // Already-invoiced time entry IDs
  const { data: invoicedTimeEntryIds = [] } = useQuery({
    queryKey: ['invoice-invoiced-time-entries'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('invoice_time_entries')
        .select('time_entry_id');
      if (error) throw error;
      return (data as { time_entry_id: string }[]).map((r) => r.time_entry_id);
    },
    enabled: !!selectedClientId,
  });

  // -----------------------------------------------------------------------
  // Derived: uninvoiced time entries
  // -----------------------------------------------------------------------
  const invoicedSet = useMemo(() => new Set(invoicedTimeEntryIds), [invoicedTimeEntryIds]);

  const uninvoicedTimeEntries = useMemo(() => {
    return allTimeEntries.filter((te) => !invoicedSet.has(te.id));
  }, [allTimeEntries, invoicedSet]);

  // Filtered by date range and activity
  const filteredTimeEntries = useMemo(() => {
    let entries = uninvoicedTimeEntries;

    if (hoursStartDate) {
      entries = entries.filter(
        (te) => te.start_time >= hoursStartDate + 'T00:00:00'
      );
    }
    if (hoursEndDate) {
      entries = entries.filter(
        (te) => te.start_time <= hoursEndDate + 'T23:59:59'
      );
    }
    if (hoursActivityFilter !== 'all') {
      entries = entries.filter((te) => te.activity_type === hoursActivityFilter);
    }
    return entries;
  }, [uninvoicedTimeEntries, hoursStartDate, hoursEndDate, hoursActivityFilter]);

  // -----------------------------------------------------------------------
  // Rate lookup helper
  // -----------------------------------------------------------------------
  const getRateForActivity = (activityType: string): number => {
    // 1. Client override
    const override = clientRateOverrides.find(
      (r) => r.activity_type === activityType
    );
    if (override) return override.hourly_rate;

    // 2. Org default
    const orgRate = serviceRates.find(
      (r) => r.activity_type === activityType
    );
    if (orgRate) return orgRate.hourly_rate;

    // 3. Fallback
    return 0;
  };

  // -----------------------------------------------------------------------
  // Effects
  // -----------------------------------------------------------------------

  // When client is selected, auto-fill invoice header
  useEffect(() => {
    if (selectedClientId && billingSettings) {
      const prefix = billingSettings.invoice_number_prefix || 'RE';
      const nextNum = billingSettings.next_invoice_number || 1;
      setInvoiceNumber(formatInvoiceNumber(prefix, nextNum));

      const today = new Date();
      setIssueDate(formatDate(today));

      const due = new Date(today);
      due.setDate(due.getDate() + (billingSettings.payment_terms_days || 30));
      setDueDate(formatDate(due));
    }
  }, [selectedClientId, billingSettings]);

  // Build subscription items when subscriptions load
  useEffect(() => {
    if (clientSubscriptions.length > 0 && selectedClientId) {
      const today = new Date();
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      setSubscriptionItems(
        clientSubscriptions.map((sub) => ({
          subscription_id: sub.id,
          description: sub.name,
          amount: sub.amount,
          interval: sub.interval,
          period_start: formatDate(firstOfMonth),
          period_end: formatDate(endOfMonth),
          selected: true,
        }))
      );
    } else {
      setSubscriptionItems([]);
    }
  }, [clientSubscriptions, selectedClientId]);

  // Build hours groups when filtered time entries change (only on explicit action)
  const buildHoursGroups = () => {
    const grouped: Record<string, { hours: number; ids: string[] }> = {};
    for (const te of filteredTimeEntries) {
      const at = te.activity_type || 'hauswartung';
      if (!grouped[at]) grouped[at] = { hours: 0, ids: [] };
      grouped[at].hours += calculateHours(te);
      grouped[at].ids.push(te.id);
    }

    const groups: HoursGroup[] = Object.entries(grouped).map(
      ([activityType, data]) => ({
        activity_type: activityType as ActivityType,
        totalHours: roundTwo(data.hours),
        rate: getRateForActivity(activityType),
        timeEntryIds: data.ids,
      })
    );

    setHoursGroups(groups);
    setHoursGroupsBuilt(true);
  };

  // Permission check redirect
  useEffect(() => {
    if (!permissions.canManageInvoices) {
      router.push('/admin');
    }
  }, [permissions.canManageInvoices, router]);

  if (!permissions.canManageInvoices) {
    return null;
  }

  // -----------------------------------------------------------------------
  // Selected client info
  // -----------------------------------------------------------------------
  const selectedClient = clients.find((c) => c.id === selectedClientId) || null;

  // -----------------------------------------------------------------------
  // Line item totals for preview
  // -----------------------------------------------------------------------
  const selectedSubscriptionItems = subscriptionItems.filter((s) => s.selected);
  const subscriptionLineItems = selectedSubscriptionItems.map((s) => ({
    line_type: 'subscription' as InvoiceLineItemType,
    description: s.description,
    quantity: 1,
    unit: 'Stk',
    unit_price: s.amount,
    total: roundTwo(s.amount),
    subscription_id: s.subscription_id,
    period_start: s.period_start,
    period_end: s.period_end,
  }));

  const hoursLineItems = hoursGroups
    .filter((g) => g.totalHours > 0)
    .map((g) => ({
      line_type: 'hours' as InvoiceLineItemType,
      description: `${ACTIVITY_LABELS[g.activity_type] || g.activity_type} — ${g.totalHours.toFixed(2)} Std`,
      quantity: roundTwo(g.totalHours),
      unit: 'Std',
      unit_price: g.rate,
      total: roundTwo(g.totalHours * g.rate),
      time_entry_ids: g.timeEntryIds,
    }));

  const manualLineItems = manualItems
    .filter((m) => m.description.trim())
    .map((m) => ({
      line_type: 'manual' as InvoiceLineItemType,
      description: m.description,
      quantity: m.quantity,
      unit: m.unit,
      unit_price: m.unit_price,
      total: roundTwo(m.quantity * m.unit_price),
    }));

  const allLineItems = [
    ...subscriptionLineItems,
    ...hoursLineItems,
    ...manualLineItems,
  ];

  const subtotal = roundTwo(
    allLineItems.reduce((sum, item) => sum + item.total, 0)
  );

  const mwstEnabled = billingSettings?.mwst_enabled ?? false;
  const mwstRate = billingSettings?.mwst_rate ?? 0;
  const mwstAmount = mwstEnabled ? roundTwo(subtotal * (mwstRate / 100)) : 0;
  const total = roundTwo(subtotal + mwstAmount);

  // -----------------------------------------------------------------------
  // Save handler
  // -----------------------------------------------------------------------
  const handleSave = async () => {
    if (!selectedClientId || allLineItems.length === 0) {
      toast.error('Bitte mindestens eine Position hinzufügen.');
      return;
    }

    setIsSaving(true);
    try {
      await ensureValidSession();

      const body = {
        client_id: selectedClientId,
        invoice_number: invoiceNumber,
        issue_date: issueDate,
        due_date: dueDate,
        notes: notes.trim() || null,
        mwst_rate: mwstEnabled ? mwstRate : 0,
        line_items: allLineItems,
      };

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Rechnung konnte nicht erstellt werden.');
      }

      const result = await res.json();
      toast.success('Rechnung wurde als Entwurf gespeichert.');
      router.push(`/admin/invoices/${result.id}`);
    } catch (error: any) {
      toast.error(error.message || 'Fehler beim Speichern.');
    } finally {
      setIsSaving(false);
    }
  };

  // -----------------------------------------------------------------------
  // Manual item helpers
  // -----------------------------------------------------------------------
  const addManualItem = () => {
    setManualItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        description: '',
        quantity: 1,
        unit: 'Stk',
        unit_price: 0,
      },
    ]);
  };

  const updateManualItem = (
    id: string,
    field: keyof ManualLineItem,
    value: string | number
  ) => {
    setManualItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const removeManualItem = (id: string) => {
    setManualItems((prev) => prev.filter((item) => item.id !== id));
  };

  // -----------------------------------------------------------------------
  // Subscription helpers
  // -----------------------------------------------------------------------
  const toggleSubscription = (subscriptionId: string) => {
    setSubscriptionItems((prev) =>
      prev.map((s) =>
        s.subscription_id === subscriptionId
          ? { ...s, selected: !s.selected }
          : s
      )
    );
  };

  const updateSubscriptionField = (
    subscriptionId: string,
    field: 'period_start' | 'period_end' | 'amount',
    value: string | number
  ) => {
    setSubscriptionItems((prev) =>
      prev.map((s) =>
        s.subscription_id === subscriptionId
          ? { ...s, [field]: value }
          : s
      )
    );
  };

  // -----------------------------------------------------------------------
  // Hours group rate update
  // -----------------------------------------------------------------------
  const updateHoursGroupRate = (activityType: ActivityType, rate: number) => {
    setHoursGroups((prev) =>
      prev.map((g) =>
        g.activity_type === activityType ? { ...g, rate } : g
      )
    );
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (clientsLoading) {
    return (
      <PageContainer header={<Header title="Neue Rechnung" showBack backHref="/admin/invoices" />}>
        <div className="text-center py-12 text-muted-foreground">
          Wird geladen...
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer header={<Header title="Neue Rechnung" showBack backHref="/admin/invoices" />}>
      <div className="space-y-6">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (s === 1) setStep(1);
                  else if (s === 2 && selectedClientId) setStep(2);
                  else if (s === 3 && selectedClientId) setStep(3);
                }}
                className={cn(
                  'w-8 h-8 rounded-full text-sm font-medium flex items-center justify-center transition-colors',
                  step === s
                    ? 'bg-primary-600 text-white'
                    : step > s
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-gray-100 text-gray-400'
                )}
              >
                {step > s ? <Check className="h-4 w-4" /> : s}
              </button>
              {s < 3 && (
                <div
                  className={cn(
                    'w-8 h-0.5',
                    step > s ? 'bg-primary-300' : 'bg-gray-200'
                  )}
                />
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {step === 1 && 'Kunde auswählen'}
          {step === 2 && 'Positionen hinzufügen'}
          {step === 3 && 'Vorschau & Speichern'}
        </p>

        {/* ----------------------------------------------------------------- */}
        {/* Step 1: Select Client                                             */}
        {/* ----------------------------------------------------------------- */}
        {step === 1 && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4 space-y-4">
                <h2 className="text-base font-semibold text-slate-800">
                  Kunde auswählen
                </h2>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-500">
                    Kunde
                  </label>
                  <select
                    value={selectedClientId}
                    onChange={(e) => {
                      setSelectedClientId(e.target.value);
                      // Reset line items when changing client
                      setSubscriptionItems([]);
                      setHoursGroups([]);
                      setHoursGroupsBuilt(false);
                      setManualItems([]);
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">— Kunde wählen —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedClient && (
                  <div className="p-3 rounded-lg border border-muted bg-slate-50 space-y-1">
                    <p className="font-medium flex items-center gap-1.5">
                      <User className="h-4 w-4 text-muted-foreground" />
                      {selectedClient.name}
                    </p>
                    {selectedClient.contact_person && (
                      <p className="text-sm text-muted-foreground">
                        {selectedClient.contact_person}
                      </p>
                    )}
                    {(selectedClient.address || selectedClient.city) && (
                      <p className="text-sm text-muted-foreground">
                        {[
                          selectedClient.address,
                          [selectedClient.postal_code, selectedClient.city]
                            .filter(Boolean)
                            .join(' '),
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    )}
                    {selectedClient.email && (
                      <p className="text-sm text-muted-foreground">
                        {selectedClient.email}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedClient && (
              <Card>
                <CardContent className="p-4 space-y-4">
                  <h2 className="text-base font-semibold text-slate-800">
                    Rechnungsdaten
                  </h2>

                  <Input
                    label="Rechnungsnummer"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-500">
                        Rechnungsdatum
                      </label>
                      <Input
                        type="date"
                        value={issueDate}
                        onChange={(e) => setIssueDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-500">
                        Fälligkeitsdatum
                      </label>
                      <Input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Button
              className="w-full"
              disabled={!selectedClientId}
              onClick={() => setStep(2)}
            >
              Weiter
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Step 2: Add Line Items                                            */}
        {/* ----------------------------------------------------------------- */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setActiveTab('subscriptions')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors',
                  activeTab === 'subscriptions'
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                Abonnements
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('hours')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors',
                  activeTab === 'hours'
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                Stundenaufwand
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('manual')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors',
                  activeTab === 'manual'
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                Manuell
              </button>
            </div>

            {/* ============================================================= */}
            {/* Tab A: Subscriptions                                          */}
            {/* ============================================================= */}
            {activeTab === 'subscriptions' && (
              <div className="space-y-3">
                {subscriptionItems.length === 0 ? (
                  <Card>
                    <CardContent className="p-4 text-center text-sm text-muted-foreground py-8">
                      Keine aktiven Abonnements für diesen Kunden.
                    </CardContent>
                  </Card>
                ) : (
                  subscriptionItems.map((sub) => (
                    <Card key={sub.subscription_id}>
                      <CardContent className="p-4 space-y-3">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sub.selected}
                            onChange={() => toggleSubscription(sub.subscription_id)}
                            className="mt-1 rounded border-gray-300"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{sub.description}</p>
                            <p className="text-sm text-muted-foreground">
                              CHF {sub.amount.toFixed(2)} / {INTERVAL_LABELS[sub.interval]}
                            </p>
                          </div>
                        </label>

                        {sub.selected && (
                          <div className="pl-7 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-500">
                                  Periode von
                                </label>
                                <Input
                                  type="date"
                                  value={sub.period_start}
                                  onChange={(e) =>
                                    updateSubscriptionField(
                                      sub.subscription_id,
                                      'period_start',
                                      e.target.value
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-500">
                                  Periode bis
                                </label>
                                <Input
                                  type="date"
                                  value={sub.period_end}
                                  onChange={(e) =>
                                    updateSubscriptionField(
                                      sub.subscription_id,
                                      'period_end',
                                      e.target.value
                                    )
                                  }
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-slate-500">
                                Betrag (CHF)
                              </label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={sub.amount}
                                onChange={(e) =>
                                  updateSubscriptionField(
                                    sub.subscription_id,
                                    'amount',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                              />
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}

            {/* ============================================================= */}
            {/* Tab B: Hours                                                  */}
            {/* ============================================================= */}
            {activeTab === 'hours' && (
              <div className="space-y-4">
                <Card>
                  <CardContent className="p-4 space-y-4">
                    <h3 className="text-sm font-semibold text-slate-800">
                      Zeitraum & Filter
                    </h3>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-500">
                          Von
                        </label>
                        <Input
                          type="date"
                          value={hoursStartDate}
                          onChange={(e) => {
                            setHoursStartDate(e.target.value);
                            setHoursGroupsBuilt(false);
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-500">
                          Bis
                        </label>
                        <Input
                          type="date"
                          value={hoursEndDate}
                          onChange={(e) => {
                            setHoursEndDate(e.target.value);
                            setHoursGroupsBuilt(false);
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500">
                        Tätigkeitstyp
                      </label>
                      <select
                        value={hoursActivityFilter}
                        onChange={(e) => {
                          setHoursActivityFilter(e.target.value);
                          setHoursGroupsBuilt(false);
                        }}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="all">Alle Tätigkeiten</option>
                        {ACTIVITY_TYPES.map((at) => (
                          <option key={at} value={at}>
                            {ACTIVITY_LABELS[at]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={buildHoursGroups}
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      Stunden laden ({filteredTimeEntries.length} Einträge)
                    </Button>
                  </CardContent>
                </Card>

                {hoursGroupsBuilt && (
                  <div className="space-y-3">
                    {hoursGroups.length === 0 ? (
                      <Card>
                        <CardContent className="p-4 text-center text-sm text-muted-foreground py-8">
                          Keine nicht-verrechneten Zeiteinträge im gewählten Zeitraum gefunden.
                        </CardContent>
                      </Card>
                    ) : (
                      hoursGroups.map((group) => (
                        <Card key={group.activity_type}>
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">
                                {ACTIVITY_LABELS[group.activity_type] || group.activity_type}
                              </h4>
                              <span className="text-sm text-muted-foreground">
                                {group.timeEntryIds.length} Einträge
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-500">
                                  Stunden
                                </label>
                                <p className="text-sm font-medium">
                                  {group.totalHours.toFixed(2)} Std
                                </p>
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-500">
                                  Ansatz (CHF)
                                </label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={group.rate}
                                  onChange={(e) =>
                                    updateHoursGroupRate(
                                      group.activity_type,
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-500">
                                  Total
                                </label>
                                <p className="text-sm font-semibold text-primary-600">
                                  CHF {roundTwo(group.totalHours * group.rate).toFixed(2)}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ============================================================= */}
            {/* Tab C: Manual                                                 */}
            {/* ============================================================= */}
            {activeTab === 'manual' && (
              <div className="space-y-3">
                {manualItems.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-3">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-500">
                              Beschreibung
                            </label>
                            <Input
                              value={item.description}
                              onChange={(e) =>
                                updateManualItem(item.id, 'description', e.target.value)
                              }
                              placeholder="Positionsbeschreibung"
                            />
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-slate-500">
                                Menge
                              </label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.quantity}
                                onChange={(e) =>
                                  updateManualItem(
                                    item.id,
                                    'quantity',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-slate-500">
                                Einheit
                              </label>
                              <Input
                                value={item.unit}
                                onChange={(e) =>
                                  updateManualItem(item.id, 'unit', e.target.value)
                                }
                                placeholder="Stk"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-slate-500">
                                Preis (CHF)
                              </label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.unit_price}
                                onChange={(e) =>
                                  updateManualItem(
                                    item.id,
                                    'unit_price',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                              />
                            </div>
                          </div>

                          <p className="text-sm font-semibold text-primary-600">
                            Total: CHF {roundTwo(item.quantity * item.unit_price).toFixed(2)}
                          </p>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeManualItem(item.id)}
                          className="text-error-500 hover:text-error-600 flex-shrink-0"
                          title="Entfernen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={addManualItem}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Zeile hinzufügen
                </Button>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(1)}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Zurück
              </Button>
              <Button className="flex-1" onClick={() => setStep(3)}>
                Vorschau
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Step 3: Preview                                                   */}
        {/* ----------------------------------------------------------------- */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Client & Invoice info */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-slate-800">
                    {invoiceNumber}
                  </h2>
                  <span className="badge bg-gray-100 text-gray-700 text-xs">
                    Entwurf
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedClient?.name}
                </p>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Datum: {new Date(issueDate).toLocaleDateString('de-CH')}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Fällig: {new Date(dueDate).toLocaleDateString('de-CH')}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Line items */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-800">
                  Positionen
                </h3>

                {allLineItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Keine Positionen hinzugefügt.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {allLineItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between gap-3 py-2 border-b border-muted last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{item.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantity} {item.unit} x CHF{' '}
                            {item.unit_price.toFixed(2)}
                          </p>
                          {('period_start' in item) && (item as any).period_start && (
                            <p className="text-xs text-muted-foreground">
                              Periode:{' '}
                              {new Date((item as any).period_start).toLocaleDateString('de-CH')}
                              {' — '}
                              {(item as any).period_end && new Date((item as any).period_end).toLocaleDateString('de-CH')}
                            </p>
                          )}
                        </div>
                        <p className="text-sm font-semibold whitespace-nowrap">
                          CHF {item.total.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Totals */}
                <div className="border-t border-slate-200 pt-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Zwischensumme</span>
                    <span className="font-medium">CHF {subtotal.toFixed(2)}</span>
                  </div>

                  {mwstEnabled && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        MWST ({mwstRate}%)
                      </span>
                      <span className="font-medium">
                        CHF {mwstAmount.toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-base font-bold pt-1 border-t border-slate-200">
                    <span>Total</span>
                    <span>CHF {total.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <label className="text-sm font-medium text-slate-500">
                  Bemerkungen (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Bemerkungen zur Rechnung..."
                  rows={3}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </CardContent>
            </Card>

            {/* Navigation + Save */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(2)}
                disabled={isSaving}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Zurück
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={isSaving || allLineItems.length === 0}
              >
                <FileText className="h-4 w-4 mr-2" />
                {isSaving ? 'Wird gespeichert...' : 'Als Entwurf speichern'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
