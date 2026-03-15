'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Plus, MapPin, Edit, Search, Power, Building2, Mail, Phone, User, Banknote, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { cn, formatSwissNumber } from '@/lib/utils';
import { ErrorBoundary } from '@/components/error-boundary';
import type { Client, ClientInsert, ClientUpdate, Property, ServiceRate, ClientRateOverride, ClientSubscription, SubscriptionInterval } from '@/types/database';

export default function AdminClientsPage() {
  return (
    <ErrorBoundary>
      <AdminClientsPageContent />
    </ErrorBoundary>
  );
}

function AdminClientsPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const organizationId = useAuthStore((state) => state.organizationId);
  const isSuperAdmin = useAuthStore((state) => state.isSuperAdmin);
  const t = useTranslations();
  const tClients = useTranslations('clientsAdmin');

  const [searchQuery, setSearchQuery] = useState('');
  const [showInactiveClients, setShowInactiveClients] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [deactivatingClient, setDeactivatingClient] = useState<Client | null>(null);
  const [showPropertiesSheet, setShowPropertiesSheet] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Rate overrides state
  const [showRatesSheet, setShowRatesSheet] = useState(false);
  const [ratesClient, setRatesClient] = useState<Client | null>(null);
  const [rateOverrides, setRateOverrides] = useState<Record<string, string>>({});
  const [rateEditing, setRateEditing] = useState<Record<string, boolean>>({});

  // Subscriptions state
  const [showSubscriptionsSheet, setShowSubscriptionsSheet] = useState(false);
  const [subscriptionsClient, setSubscriptionsClient] = useState<Client | null>(null);
  const [showSubForm, setShowSubForm] = useState(false);
  const [editingSub, setEditingSub] = useState<ClientSubscription | null>(null);
  const [subName, setSubName] = useState('');
  const [subDescription, setSubDescription] = useState('');
  const [subAmount, setSubAmount] = useState('');
  const [subInterval, setSubInterval] = useState<SubscriptionInterval>('monthly');
  const [subNextBillingDate, setSubNextBillingDate] = useState('');
  const [subIsActive, setSubIsActive] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');

  // Fetch clients
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['admin-clients'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('clients')
        .select('*, organizations:organization_id(name)')
        .order('name');

      if (error) throw error;
      return data as (Client & { organizations?: { name: string } })[];
    },
  });

  // Fetch properties for the selected client
  const { data: clientProperties = [] } = useQuery({
    queryKey: ['client-properties', selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient) return [];
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('properties')
        .select('id, name, address, postal_code, city')
        .eq('client_id', selectedClient.id)
        .order('name');

      if (error) throw error;
      return data as Pick<Property, 'id' | 'name' | 'address' | 'postal_code' | 'city'>[];
    },
    enabled: !!selectedClient,
  });

  // Count properties per client (for badges)
  const { data: propertyCounts = {} } = useQuery({
    queryKey: ['client-property-counts'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('properties')
        .select('client_id')
        .not('client_id', 'is', null);

      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data) {
        counts[row.client_id] = (counts[row.client_id] || 0) + 1;
      }
      return counts;
    },
  });

  // Fetch org service rates (for showing defaults in rate override sheet)
  const { data: orgRates = [] } = useQuery({
    queryKey: ['org-service-rates'],
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

  // Fetch rate overrides for selected client
  const { data: clientRateOverrides = [] } = useQuery({
    queryKey: ['client-rate-overrides', ratesClient?.id],
    queryFn: async () => {
      if (!ratesClient) return [];
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('client_rate_overrides')
        .select('*')
        .eq('client_id', ratesClient.id);
      if (error) throw error;
      return data as ClientRateOverride[];
    },
    enabled: !!ratesClient,
  });

  // Fetch subscriptions for selected client
  const { data: clientSubs = [] } = useQuery({
    queryKey: ['client-subscriptions', subscriptionsClient?.id],
    queryFn: async () => {
      if (!subscriptionsClient) return [];
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('client_subscriptions')
        .select('*')
        .eq('client_id', subscriptionsClient.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ClientSubscription[];
    },
    enabled: !!subscriptionsClient,
  });

  const tAct = useTranslations('activities');
  const ACTIVITY_TYPES = [
    { key: 'hauswartung', label: tAct('hauswartung') },
    { key: 'rasen_maehen', label: tAct('rasen_maehen') },
    { key: 'hecken_schneiden', label: tAct('hecken_schneiden') },
    { key: 'regie', label: tAct('regie') },
    { key: 'reinigung', label: tAct('reinigung') },
  ];

  const INTERVAL_LABELS: Record<SubscriptionInterval, string> = {
    monthly: tClients('monthly'),
    quarterly: tClients('quarterly'),
    half_yearly: tClients('semiAnnually'),
    annually: tClients('annually'),
  };

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
        if (refreshError) {
          throw new Error(t('auth.sessionExpired'));
        }
      }
      lastSessionCheck.current = now;
    } finally {
      sessionRefreshLock.current = false;
    }
  };

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: ClientInsert) => {
      const supabase = getClient();
      await ensureValidSession();

      const { data: result, error } = await (supabase as any)
        .from('clients')
        .insert({ ...data, organization_id: organizationId })
        .select()
        .single();

      if (error) {
        if (error.code === '42501' || error.message?.includes('permission') || error.code === 'PGRST301') {
          await supabase.auth.refreshSession();
          const { data: retryResult, error: retryError } = await (supabase as any)
            .from('clients')
            .insert({ ...data, organization_id: organizationId })
            .select()
            .single();
          if (retryError) throw retryError;
          return retryResult as Client;
        }
        throw error;
      }
      return result as Client;
    },
    onSuccess: () => {
      toast.success(tClients('created'));
      queryClient.invalidateQueries({ queryKey: ['admin-clients'] });
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ClientUpdate }) => {
      const supabase = getClient();
      await ensureValidSession();

      const { data: result, error } = await (supabase as any)
        .from('clients')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === '42501' || error.message?.includes('permission') || error.code === 'PGRST301') {
          await supabase.auth.refreshSession();
          const { data: retryResult, error: retryError } = await (supabase as any)
            .from('clients')
            .update(data)
            .eq('id', id)
            .select()
            .single();
          if (retryError) throw retryError;
          return retryResult as Client;
        }
        throw error;
      }
      return result as Client;
    },
    onSuccess: () => {
      toast.success(tClients('updated'));
      queryClient.invalidateQueries({ queryKey: ['admin-clients'] });
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ clientId, isActive }: { clientId: string; isActive: boolean }) => {
      const supabase = getClient();
      await ensureValidSession();

      const { error } = await (supabase as any)
        .from('clients')
        .update({ is_active: isActive })
        .eq('id', clientId);

      if (error) {
        if (error.code === '42501' || error.message?.includes('permission') || error.code === 'PGRST301') {
          await supabase.auth.refreshSession();
          const { error: retryError } = await (supabase as any)
            .from('clients')
            .update({ is_active: isActive })
            .eq('id', clientId);
          if (retryError) throw retryError;
          return { clientId, isActive };
        }
        throw error;
      }
      return { clientId, isActive };
    },
    onSuccess: (_, { isActive }) => {
      toast.success(isActive ? tClients('activated') : tClients('deactivated'));
      queryClient.invalidateQueries({ queryKey: ['admin-clients'] });
      setShowDeactivateDialog(false);
      setDeactivatingClient(null);
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });

  // Save rate overrides mutation
  const saveRateOverridesMutation = useMutation({
    mutationFn: async (overrides: Record<string, string>) => {
      if (!ratesClient) return;
      const supabase = getClient();
      await ensureValidSession();

      for (const [activityType, rateStr] of Object.entries(overrides)) {
        const rate = parseFloat(rateStr);
        if (rateStr.trim() === '' || isNaN(rate)) {
          // Delete override if empty
          await (supabase as any)
            .from('client_rate_overrides')
            .delete()
            .eq('client_id', ratesClient.id)
            .eq('activity_type', activityType);
        } else {
          const { error } = await (supabase as any)
            .from('client_rate_overrides')
            .upsert({
              organization_id: organizationId,
              client_id: ratesClient.id,
              activity_type: activityType,
              hourly_rate: rate,
            }, { onConflict: 'organization_id,client_id,activity_type' });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(t('common.success'));
      queryClient.invalidateQueries({ queryKey: ['client-rate-overrides', ratesClient?.id] });
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });

  // Subscription CRUD mutations
  const saveSubMutation = useMutation({
    mutationFn: async (data: { name: string; description: string | null; yearly_amount: number; interval: SubscriptionInterval; next_billing_date: string | null; is_active: boolean }) => {
      if (!subscriptionsClient) return;
      const supabase = getClient();
      await ensureValidSession();

      if (editingSub) {
        const { error } = await (supabase as any)
          .from('client_subscriptions')
          .update(data)
          .eq('id', editingSub.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('client_subscriptions')
          .insert({
            ...data,
            organization_id: organizationId,
            client_id: subscriptionsClient.id,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t('common.success'));
      queryClient.invalidateQueries({ queryKey: ['client-subscriptions', subscriptionsClient?.id] });
      resetSubForm();
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });

  const deleteSubMutation = useMutation({
    mutationFn: async (subId: string) => {
      const supabase = getClient();
      await ensureValidSession();
      const { error } = await (supabase as any)
        .from('client_subscriptions')
        .delete()
        .eq('id', subId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('common.success'));
      queryClient.invalidateQueries({ queryKey: ['client-subscriptions', subscriptionsClient?.id] });
    },
    onError: (error: Error) => {
      toast.error(`${t('common.error')}: ${error.message}`);
    },
  });

  const resetSubForm = () => {
    setSubName('');
    setSubDescription('');
    setSubAmount('');
    setSubInterval('monthly');
    setSubNextBillingDate('');
    setSubIsActive(true);
    setEditingSub(null);
    setShowSubForm(false);
  };

  const openEditSubForm = (sub: ClientSubscription) => {
    setSubName(sub.name);
    setSubDescription(sub.description || '');
    setSubAmount(String(sub.yearly_amount));
    setSubInterval(sub.interval);
    setSubNextBillingDate(sub.next_billing_date || '');
    setSubIsActive(sub.is_active);
    setEditingSub(sub);
    setShowSubForm(true);
  };

  const openRatesSheet = (client: Client) => {
    setRatesClient(client);
    setRateOverrides({});
    setShowRatesSheet(true);
  };

  const openSubscriptionsSheet = (client: Client) => {
    setSubscriptionsClient(client);
    resetSubForm();
    setShowSubscriptionsSheet(true);
  };

  // Redirect if no permission
  useEffect(() => {
    if (!permissions.canManageProperties) {
      router.push('/admin');
    }
  }, [permissions.canManageProperties, router]);

  const resetForm = () => {
    setName('');
    setContactPerson('');
    setEmail('');
    setPhone('');
    setAddress('');
    setPostalCode('');
    setCity('');
    setNotes('');
    setEditingClient(null);
    setShowForm(false);
  };

  const openEditForm = (client: Client) => {
    setName(client.name);
    setContactPerson(client.contact_person || '');
    setEmail(client.email || '');
    setPhone(client.phone || '');
    setAddress(client.address || '');
    setPostalCode(client.postal_code || '');
    setCity(client.city || '');
    setNotes(client.notes || '');
    setEditingClient(client);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: ClientInsert | ClientUpdate = {
      name: name.trim(),
      contact_person: contactPerson.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      postal_code: postalCode.trim() || null,
      city: city.trim() || null,
      notes: notes.trim() || null,
    };

    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, data });
    } else {
      createMutation.mutate(data as ClientInsert);
    }
  };

  // Filter clients by search and active status
  const filteredClients = clients.filter((client) => {
    if (!showInactiveClients && !client.is_active) return false;

    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      client.name.toLowerCase().includes(search) ||
      (client.contact_person || '').toLowerCase().includes(search) ||
      (client.address || '').toLowerCase().includes(search) ||
      (client.city || '').toLowerCase().includes(search)
    );
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (!permissions.canManageProperties) {
    return null;
  }

  return (
    <PageContainer
      header={
        <Header
          title={tClients('title')}
          rightElement={
            <Button size="icon" onClick={() => setShowForm(true)}>
              <Plus className="h-5 w-5" />
            </Button>
          }
        />
      }
    >
      {/* Search and Filters */}
      <div className="space-y-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={tClients('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showInactiveClients}
            onChange={(e) => setShowInactiveClients(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-muted-foreground">{tClients('showInactive')}</span>
        </label>
      </div>

      {/* Clients list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          {t('common.loading')}
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{tClients('noClients')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredClients.map((client) => {
            const inactive = !client.is_active;
            const propCount = propertyCounts[client.id] || 0;

            return (
              <Card key={client.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left"
                      onClick={() => {
                        setSelectedClient(client);
                        setShowPropertiesSheet(true);
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{client.name}</h3>
                        {propCount > 0 && (
                          <span className="badge badge-info text-xs flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {propCount}
                          </span>
                        )}
                        {inactive && (
                          <span className="badge bg-gray-100 text-gray-700 text-xs">
                            {tClients('inactive')}
                          </span>
                        )}
                        {isSuperAdmin && client.organizations?.name && (
                          <span className="hidden sm:inline-flex badge bg-purple-100 text-purple-700 text-xs">
                            {client.organizations.name}
                          </span>
                        )}
                      </div>
                      {client.contact_person && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                          <User className="h-3 w-3" />
                          {client.contact_person}
                        </p>
                      )}
                      {(client.address || client.city) && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" />
                          {[client.address, [client.postal_code, client.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                        </p>
                      )}
                      {client.email && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Mail className="h-3 w-3" />
                          {client.email}
                        </p>
                      )}
                      {client.phone && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" />
                          {client.phone}
                        </p>
                      )}
                    </button>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (inactive) {
                            toggleActiveMutation.mutate({ clientId: client.id, isActive: true });
                          } else {
                            setDeactivatingClient(client);
                            setShowDeactivateDialog(true);
                          }
                        }}
                        title={inactive ? tClients('activated') : tClients('deactivateTitle')}
                        disabled={toggleActiveMutation.isPending}
                      >
                        <Power className={cn('h-4 w-4', inactive ? 'text-green-500' : 'text-gray-400')} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditForm(client)}
                        title={t('common.edit')}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {permissions.canManageInvoices && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openRatesSheet(client)}
                            title={tClients('rates')}
                          >
                            <Banknote className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openSubscriptionsSheet(client)}
                            title={tClients('subscriptionsTab')}
                          >
                            <Repeat className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {isSuperAdmin && client.organizations?.name && (
                    <span className="sm:hidden block w-full rounded-full px-2.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 mt-2">
                      {client.organizations.name}
                    </span>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Client form sheet */}
      <Sheet open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <SheetContent side="bottom" className="h-[85vh]">
          <SheetHeader>
            <SheetTitle>
              {editingClient ? tClients('editClient') : tClients('newClient')}
            </SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4 overflow-y-auto max-h-[calc(85vh-120px)]">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {tClients('name')} <span className="text-error-500">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder=""
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{tClients('contactPerson')}</label>
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder=""
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">{tClients('email')}</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder=""
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{tClients('phone')}</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder=""
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{tClients('address')}</label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder=""
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">{tClients('postalCode')}</label>
                <Input
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="8000"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{tClients('city')}</label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Zürich"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('calendar.notes')}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder=""
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={resetForm}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isSubmitting || !name.trim()}
              >
                {isSubmitting
                  ? t('common.saving')
                  : editingClient
                  ? t('common.save')
                  : t('common.save')}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Deactivate confirmation dialog */}
      <Dialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tClients('deactivateTitle')}</DialogTitle>
            <DialogDescription>
              {tClients('deactivateMessage', { name: deactivatingClient?.name || '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeactivateDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deactivatingClient && toggleActiveMutation.mutate({ clientId: deactivatingClient.id, isActive: false })}
              disabled={toggleActiveMutation.isPending}
            >
              {toggleActiveMutation.isPending ? t('common.loading') : tClients('deactivateTitle')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client properties sheet */}
      <Sheet open={showPropertiesSheet} onOpenChange={(open) => {
        setShowPropertiesSheet(open);
        if (!open) setSelectedClient(null);
      }}>
        <SheetContent side="bottom" className="h-[50vh]">
          <SheetHeader>
            <SheetTitle>
              {tClients('assignedProperties')} – {selectedClient?.name || ''}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-2 overflow-y-auto max-h-[calc(50vh-100px)]">
            {clientProperties.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {tClients('noProperties')}
              </p>
            ) : (
              clientProperties.map((property) => (
                <div
                  key={property.id}
                  className="p-3 rounded-lg border border-muted"
                >
                  <p className="font-medium">{property.name}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" />
                    {property.address}, {property.postal_code} {property.city}
                  </p>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Client rate overrides sheet */}
      <Sheet open={showRatesSheet} onOpenChange={(open) => {
        setShowRatesSheet(open);
        if (!open) setRatesClient(null);
      }}>
        <SheetContent side="bottom" className="h-[70vh]">
          <SheetHeader>
            <SheetTitle>
              {tClients('hourlyRatesFor', { name: ratesClient?.name || '' })}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4 overflow-y-auto max-h-[calc(70vh-140px)]">
            <p className="text-xs text-muted-foreground">
              {tClients('ratesNote')}
            </p>
            <div className="space-y-2">
              {ACTIVITY_TYPES.map((at) => {
                const orgRate = orgRates.find((r) => r.activity_type === at.key);
                const clientOverride = clientRateOverrides.find((r) => r.activity_type === at.key);
                const rawValue = rateOverrides[at.key] ?? (clientOverride ? String(clientOverride.hourly_rate) : '');
                const numVal = parseFloat(rawValue);
                const displayValue = rateEditing[at.key] || !rawValue ? rawValue : (isNaN(numVal) ? rawValue : formatSwissNumber(numVal));

                return (
                  <div key={at.key} className="flex items-center gap-3">
                    <label className="text-sm font-medium w-36 flex-shrink-0">{at.label}</label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder={orgRate ? formatSwissNumber(orgRate.hourly_rate) : '—'}
                      value={displayValue}
                      onFocus={() => setRateEditing((prev) => ({ ...prev, [at.key]: true }))}
                      onBlur={() => setRateEditing((prev) => ({ ...prev, [at.key]: false }))}
                      onChange={(e) => setRateOverrides((prev) => ({ ...prev, [at.key]: e.target.value }))}
                      className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-8 flex-shrink-0">/{tClients('perHour')}</span>
                  </div>
                );
              })}
            </div>

            <Button
              className="w-full"
              onClick={() => saveRateOverridesMutation.mutate(rateOverrides)}
              disabled={saveRateOverridesMutation.isPending}
            >
              {saveRateOverridesMutation.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Client subscriptions sheet */}
      <Sheet open={showSubscriptionsSheet} onOpenChange={(open) => {
        setShowSubscriptionsSheet(open);
        if (!open) {
          setSubscriptionsClient(null);
          resetSubForm();
        }
      }}>
        <SheetContent side="bottom" className="h-[85vh]">
          <SheetHeader>
            <SheetTitle>
              {tClients('subscriptionsTab')} – {subscriptionsClient?.name || ''}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 overflow-y-auto max-h-[calc(85vh-120px)]">
            {!showSubForm ? (
              <div className="space-y-3">
                <Button
                  onClick={() => setShowSubForm(true)}
                  className="w-full"
                  variant="outline"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {tClients('subscriptionsTab')}
                </Button>

                {clientSubs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {t('common.noData')}
                  </p>
                ) : (
                  clientSubs.map((sub) => (
                    <Card key={sub.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{sub.name}</h4>
                              {!sub.is_active && (
                                <span className="badge bg-gray-100 text-gray-700 text-xs">{tClients('inactive')}</span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-primary-600 mt-0.5">
                              CHF {formatSwissNumber(sub.yearly_amount)} / Jahr
                            </p>
                            {sub.description && (
                              <p className="text-sm text-muted-foreground mt-0.5">{sub.description}</p>
                            )}
                            {sub.next_billing_date && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {tClients('billingInterval')}: {new Date(sub.next_billing_date).toLocaleDateString('de-CH')}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditSubForm(sub)}
                              title={t('common.edit')}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteSubMutation.mutate(sub.id)}
                              disabled={deleteSubMutation.isPending}
                              title={t('common.delete')}
                              className="text-error-500 hover:text-error-600"
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveSubMutation.mutate({
                    name: subName.trim(),
                    description: subDescription.trim() || null,
                    yearly_amount: parseFloat(subAmount),
                    interval: subInterval,
                    next_billing_date: subNextBillingDate || null,
                    is_active: subIsActive,
                  });
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {tClients('name')} <span className="text-error-500">*</span>
                  </label>
                  <Input
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                    placeholder=""
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('common.description')}</label>
                  <Input
                    value={subDescription}
                    onChange={(e) => setSubDescription(e.target.value)}
                    placeholder=""
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {`${t('common.total')} / ${tClients('annually')}`} <span className="text-error-500">*</span>
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={subAmount}
                      onChange={(e) => setSubAmount(e.target.value)}
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{tClients('billingInterval')}</label>
                    <select
                      value={subInterval}
                      onChange={(e) => setSubInterval(e.target.value as SubscriptionInterval)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="monthly">{tClients('monthly')}</option>
                      <option value="quarterly">{tClients('quarterly')}</option>
                      <option value="half_yearly">{tClients('semiAnnually')}</option>
                      <option value="annually">{tClients('annually')}</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('common.date')}</label>
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
                  <span>{tClients('active')}</span>
                </label>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={resetSubForm}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={saveSubMutation.isPending || !subName.trim() || !subAmount}
                  >
                    {saveSubMutation.isPending
                      ? t('common.saving')
                      : editingSub
                      ? t('common.save')
                      : t('common.save')}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}
