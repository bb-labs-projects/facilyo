'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search, FileText, Send, Loader2 } from 'lucide-react';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { cn, formatCHF } from '@/lib/utils';
import { ErrorBoundary } from '@/components/error-boundary';
import { InvoiceSettings } from './components/invoice-settings';
import { InvoiceSubscriptions } from './components/invoice-subscriptions';
import type { InvoiceWithClient, Client } from '@/types/database';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Entwurf',
  pending_approval: 'Genehmigung ausstehend',
  approved: 'Genehmigt',
  sent: 'Gesendet',
  paid: 'Bezahlt',
  overdue: 'Überfällig',
  cancelled: 'Storniert',
};

const STATUS_FILTER_OPTIONS: { key: string; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'draft', label: 'Entwurf' },
  { key: 'sent', label: 'Gesendet' },
  { key: 'paid', label: 'Bezahlt' },
  { key: 'overdue', label: 'Überfällig' },
  { key: 'cancelled', label: 'Storniert' },
];

function getDisplayStatus(invoice: InvoiceWithClient): string {
  if (invoice.status === 'sent' && new Date(invoice.due_date) < new Date()) {
    return 'overdue';
  }
  return invoice.status;
}

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case 'draft':
      return 'bg-gray-100 text-gray-700';
    case 'pending_approval':
      return 'bg-yellow-100 text-yellow-800';
    case 'approved':
      return 'bg-blue-100 text-blue-700';
    case 'sent':
      return 'bg-blue-100 text-blue-700';
    case 'paid':
      return 'bg-green-100 text-green-700';
    case 'overdue':
      return 'bg-red-100 text-red-700';
    case 'cancelled':
      return 'bg-gray-100 text-gray-500 line-through';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-CH');
}

export default function AdminInvoicesPage() {
  return (
    <ErrorBoundary>
      <AdminInvoicesPageContent />
    </ErrorBoundary>
  );
}

function AdminInvoicesPageContent() {
  const router = useRouter();
  const permissions = usePermissions();
  const organizationId = useAuthStore((state) => state.organizationId);

  const [activeTab, setActiveTab] = useState<'invoices' | 'subscriptions' | 'settings'>('invoices');
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Redirect if no permission — only when role is known (not during loading)
  useEffect(() => {
    if (permissions.role && !permissions.canManageInvoices) {
      router.push('/admin');
    }
  }, [permissions.role, permissions.canManageInvoices, router]);

  // Fetch invoices with client info
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['admin-invoices'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('invoices')
        .select('*, clients(*)')
        .order('issue_date', { ascending: false });

      if (error) throw error;
      return data as InvoiceWithClient[];
    },
    enabled: !!organizationId,
  });

  // Fetch clients for filter dropdown
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

  // Fetch billing settings to check approval_required
  const { data: billingSettings } = useQuery({
    queryKey: ['billing-settings'],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('organization_billing_settings')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const queryClient = useQueryClient();
  const approvalRequired = billingSettings?.approval_required ?? false;
  const sendableStatus = approvalRequired ? 'approved' : 'draft';
  const sendableInvoices = invoices.filter((inv) => inv.status === sendableStatus);

  const bulkSendMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/invoices/bulk-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Massenversand fehlgeschlagen');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-invoices'] });
      if (data.failed === 0) {
        toast.success(`${data.sent} Rechnung(en) erfolgreich versendet`);
      } else {
        toast.warning(`${data.sent} versendet, ${data.failed} fehlgeschlagen`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleBulkSend = () => {
    if (!window.confirm(
      `Möchten Sie ${sendableInvoices.length} Rechnung(en) versenden?`
    )) return;
    bulkSendMutation.mutate();
  };

  // Compute summary values
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const outstandingTotal = invoices
    .filter((inv) => inv.status === 'sent')
    .reduce((sum, inv) => sum + inv.total, 0);

  const paidThisMonthTotal = invoices
    .filter((inv) => {
      if (inv.status !== 'paid' || !inv.paid_at) return false;
      const paidDate = new Date(inv.paid_at);
      return paidDate.getMonth() === currentMonth && paidDate.getFullYear() === currentYear;
    })
    .reduce((sum, inv) => sum + inv.total, 0);

  const draftCount = invoices.filter((inv) => inv.status === 'draft').length;

  // Filter invoices
  const filteredInvoices = invoices.filter((invoice) => {
    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'overdue') {
        const displayStatus = getDisplayStatus(invoice);
        if (displayStatus !== 'overdue') return false;
      } else {
        if (invoice.status !== statusFilter) return false;
      }
    }

    // Client filter
    if (clientFilter !== 'all') {
      if (invoice.client_id !== clientFilter) return false;
    }

    // Search filter
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      const matchesNumber = invoice.invoice_number.toLowerCase().includes(search);
      const matchesClient = invoice.clients?.name?.toLowerCase().includes(search);
      if (!matchesNumber && !matchesClient) return false;
    }

    return true;
  });

  if (!permissions.canManageInvoices) {
    return null;
  }

  return (
    <PageContainer
      header={
        <Header
          title="Rechnungen"
          rightElement={
            activeTab === 'invoices' ? (
              <Button size="icon" onClick={() => router.push('/admin/invoices/new')}>
                <Plus className="h-5 w-5" />
              </Button>
            ) : undefined
          }
        />
      }
    >
      {/* Tab bar */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('invoices')}
          className={cn(
            'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
            activeTab === 'invoices'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          )}
        >
          Rechnungen
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('subscriptions')}
          className={cn(
            'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
            activeTab === 'subscriptions'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          )}
        >
          Abonnements
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={cn(
            'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
            activeTab === 'settings'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          )}
        >
          Einstellungen
        </button>
      </div>

      {activeTab === 'settings' ? (
        <InvoiceSettings />
      ) : activeTab === 'subscriptions' ? (
        <InvoiceSubscriptions />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Ausstehend</p>
                <p className="text-sm font-semibold mt-0.5">{formatCHF(outstandingTotal)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Bezahlt (Monat)</p>
                <p className="text-sm font-semibold mt-0.5">{formatCHF(paidThisMonthTotal)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Entwürfe</p>
                <p className="text-sm font-semibold mt-0.5">{draftCount}</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="space-y-3 mb-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechnung suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Status filter badges */}
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setStatusFilter(option.key)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                    statusFilter === option.key
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* Client filter dropdown */}
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="all">Alle Kunden</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          {/* Bulk Send Button */}
          {sendableInvoices.length > 0 && (
            <div className="mb-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleBulkSend}
                disabled={bulkSendMutation.isPending}
              >
                {bulkSendMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {bulkSendMutation.isPending
                  ? 'Wird versendet...'
                  : approvalRequired
                    ? `Alle genehmigten versenden (${sendableInvoices.length})`
                    : `Alle Entwürfe versenden (${sendableInvoices.length})`
                }
              </Button>
            </div>
          )}

          {/* Invoice List */}
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              Wird geladen...
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Keine Rechnungen gefunden</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredInvoices.map((invoice) => {
                const displayStatus = getDisplayStatus(invoice);
                return (
                  <Card
                    key={invoice.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => router.push(`/admin/invoices/${invoice.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-medium">{invoice.invoice_number}</h3>
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-xs font-medium',
                                getStatusBadgeClasses(displayStatus)
                              )}
                            >
                              {STATUS_LABELS[displayStatus] ?? displayStatus}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {invoice.clients?.name}
                          </p>
                          {invoice.clients?.contact_person && (
                            <p className="text-xs text-muted-foreground">
                              {invoice.clients.contact_person}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {invoice.sent_to_email || invoice.clients?.email || 'Keine E-Mail'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDate(invoice.issue_date)}
                          </p>
                        </div>
                        <p className="text-sm font-semibold whitespace-nowrap">
                          {formatCHF(invoice.total)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
