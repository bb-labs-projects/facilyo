'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { ErrorBoundary } from '@/components/error-boundary';
import { useTranslations } from 'next-intl';
import { formatCHF } from '@/lib/utils';
import type { Invoice, InvoiceLineItem, Client } from '@/types/database';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100;
}

type InvoiceWithDetails = Invoice & {
  clients: Client;
  invoice_line_items: InvoiceLineItem[];
};

interface EditableLineItem {
  key: string;
  line_type: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  subscription_id: string | null;
  period_start: string | null;
  period_end: string | null;
  time_entry_ids?: string[];
}

export default function EditInvoicePage() {
  return (
    <ErrorBoundary>
      <EditInvoicePageContent />
    </ErrorBoundary>
  );
}

function EditInvoicePageContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const permissions = usePermissions();
  const organizationId = useAuthStore((state) => state.organizationId);
  const tInv = useTranslations('invoicesAdmin');

  // Form state
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<EditableLineItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Session refresh
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
        if (refreshError) throw new Error(tInv('edit.sessionExpired'));
      }
      lastSessionCheck.current = now;
    } finally {
      sessionRefreshLock.current = false;
    }
  };

  // Redirect if no permission
  useEffect(() => {
    if (permissions.role && !permissions.canManageInvoices) {
      router.push('/admin');
    }
  }, [permissions.role, permissions.canManageInvoices, router]);

  // Fetch invoice
  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('invoices')
        .select('*, clients(*), invoice_line_items(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as InvoiceWithDetails;
    },
    enabled: !!id,
  });

  // Fetch billing settings for MWST
  const { data: billingSettings } = useQuery({
    queryKey: ['billing-settings', organizationId],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await (supabase as any)
        .from('organization_billing_settings')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return data as { mwst_enabled: boolean; mwst_rate: number } | null;
    },
    enabled: !!organizationId,
  });

  // Initialize form from fetched invoice
  useEffect(() => {
    if (invoice && !initialized) {
      setIssueDate(invoice.issue_date);
      setDueDate(invoice.due_date);
      setNotes(invoice.notes || '');

      const sorted = [...invoice.invoice_line_items].sort(
        (a, b) => a.sort_order - b.sort_order
      );
      setLineItems(
        sorted.map((item) => ({
          key: item.id,
          line_type: item.line_type,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          subscription_id: item.subscription_id,
          period_start: item.period_start,
          period_end: item.period_end,
        }))
      );
      setInitialized(true);
    }
  }, [invoice, initialized]);

  // Computed totals
  const mwstEnabled = billingSettings?.mwst_enabled ?? false;
  const mwstRate = invoice?.mwst_rate ?? billingSettings?.mwst_rate ?? 0;
  const subtotal = roundTwo(
    lineItems.reduce((sum, item) => sum + roundTwo(item.quantity * item.unit_price), 0)
  );
  const mwstAmount = mwstEnabled ? roundTwo(subtotal * (mwstRate / 100)) : 0;
  const total = roundTwo(subtotal + mwstAmount);

  // Line item helpers
  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        line_type: 'manual',
        description: '',
        quantity: 1,
        unit: 'Stk',
        unit_price: 0,
        subscription_id: null,
        period_start: null,
        period_end: null,
      },
    ]);
  };

  const updateLineItem = (key: string, field: keyof EditableLineItem, value: string | number) => {
    setLineItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, [field]: value } : item))
    );
  };

  const removeLineItem = (key: string) => {
    setLineItems((prev) => prev.filter((item) => item.key !== key));
  };

  // Save handler
  const handleSave = async () => {
    if (lineItems.length === 0) {
      toast.error(tInv('edit.minOneLineItem'));
      return;
    }

    setIsSaving(true);
    try {
      await ensureValidSession();

      const patchBody = {
        issue_date: issueDate,
        due_date: dueDate,
        notes: notes.trim() || null,
        mwst_rate: mwstEnabled ? mwstRate : 0,
        subtotal,
        mwst_amount: mwstAmount,
        total,
        line_items: lineItems.map((item) => ({
          line_type: item.line_type,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          total: roundTwo(item.quantity * item.unit_price),
          subscription_id: item.subscription_id || undefined,
          period_start: item.period_start || undefined,
          period_end: item.period_end || undefined,
          time_entry_ids: item.time_entry_ids || undefined,
        })),
      };

      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || tInv('edit.saveFailed'));
      }

      toast.success(tInv('edit.updateSuccess'));
      router.push(`/admin/invoices/${id}`);
    } catch (error: any) {
      toast.error(error.message || tInv('edit.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!permissions.canManageInvoices) {
    return null;
  }

  if (isLoading || !initialized) {
    return (
      <PageContainer header={<Header title={tInv('edit.title')} />}>
        <div className="text-center py-12 text-muted-foreground">{tInv('edit.loading')}</div>
      </PageContainer>
    );
  }

  if (!invoice) {
    return (
      <PageContainer header={<Header title={tInv('edit.title')} />}>
        <div className="text-center py-12 text-muted-foreground">
          {tInv('edit.notFound')}
        </div>
      </PageContainer>
    );
  }

  if (invoice.status !== 'draft') {
    return (
      <PageContainer header={<Header title={tInv('edit.title')} />}>
        <div className="text-center py-12 text-muted-foreground">
          {tInv('edit.onlyDrafts')}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer header={<Header title={tInv('edit.title')} />}>
      <div className="space-y-4 max-w-3xl mx-auto">
        {/* Back link */}
        <Link
          href={`/admin/invoices/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {tInv('edit.backToInvoice')}
        </Link>

        {/* Invoice header */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">{tInv('edit.invoiceNumber')}</p>
                <p className="text-sm font-medium">{invoice.invoice_number}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{tInv('edit.client')}</p>
                <p className="text-sm font-medium">{invoice.clients?.name}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500">{tInv('edit.invoiceDate')}</label>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500">{tInv('edit.dueDate')}</label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Line items */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <h3 className="font-medium">{tInv('edit.lineItems')}</h3>

            {lineItems.map((item) => (
              <div key={item.key} className="space-y-3 p-3 rounded-lg border border-muted">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500">{tInv('edit.description')}</label>
                      <Input
                        value={item.description}
                        onChange={(e) => updateLineItem(item.key, 'description', e.target.value)}
                        placeholder={tInv('edit.descriptionPlaceholder')}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-500">{tInv('edit.quantity')}</label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.quantity}
                          onChange={(e) =>
                            updateLineItem(item.key, 'quantity', parseFloat(e.target.value) || 0)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-500">{tInv('edit.unit')}</label>
                        <Input
                          value={item.unit}
                          onChange={(e) => updateLineItem(item.key, 'unit', e.target.value)}
                          placeholder={tInv('edit.unitPlaceholder')}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-500">{tInv('edit.priceCHF')}</label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unit_price}
                          onChange={(e) =>
                            updateLineItem(item.key, 'unit_price', parseFloat(e.target.value) || 0)
                          }
                        />
                      </div>
                    </div>

                    <p className="text-sm font-semibold text-primary-600">
                      Total: {formatCHF(roundTwo(item.quantity * item.unit_price))}
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLineItem(item.key)}
                    className="text-error-500 hover:text-error-600 flex-shrink-0"
                    title={tInv('edit.removeTitle')}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            <Button variant="outline" className="w-full" onClick={addLineItem} type="button">
              <Plus className="h-4 w-4 mr-2" />
              {tInv('edit.addLineItem')}
            </Button>

            {/* Totals */}
            <div className="border-t border-slate-200 pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{tInv('edit.subtotal')}</span>
                <span className="font-medium">{formatCHF(subtotal)}</span>
              </div>
              {mwstEnabled && mwstRate > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">MWST ({mwstRate}%)</span>
                  <span className="font-medium">{formatCHF(mwstAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-1 border-t border-slate-200">
                <span>{tInv('edit.total')}</span>
                <span>{formatCHF(total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <label className="text-sm font-medium text-slate-500">{tInv('edit.notes')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={tInv('edit.notesPlaceholder')}
              rows={3}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </CardContent>
        </Card>

        {/* Save */}
        <Button
          className="w-full"
          onClick={handleSave}
          disabled={isSaving || lineItems.length === 0}
        >
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? tInv('edit.saving') : tInv('edit.save')}
        </Button>
      </div>
    </PageContainer>
  );
}
