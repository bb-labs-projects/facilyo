'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Header, PageContainer } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { getClient } from '@/lib/supabase/client';
import { ErrorBoundary } from '@/components/error-boundary';
import { cn } from '@/lib/utils';
import type { Invoice, InvoiceLineItem, Client, InvoiceStatus } from '@/types/database';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FileText,
  Send,
  Check,
  X,
  Edit,
  Trash2,
  Eye,
  ArrowLeft,
  Clock,
  CheckCircle,
} from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Entwurf',
  pending_approval: 'Genehmigung ausstehend',
  approved: 'Genehmigt',
  sent: 'Gesendet',
  paid: 'Bezahlt',
  overdue: 'Überfällig',
  cancelled: 'Storniert',
};

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case 'draft':
      return 'bg-gray-100 text-gray-700';
    case 'pending_approval':
      return 'bg-yellow-100 text-yellow-700';
    case 'approved':
      return 'bg-blue-100 text-blue-700';
    case 'sent':
      return 'bg-blue-100 text-blue-700';
    case 'paid':
      return 'bg-green-100 text-green-700';
    case 'overdue':
      return 'bg-red-100 text-red-700';
    case 'cancelled':
      return 'bg-gray-100 text-gray-700 line-through';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function getDisplayStatus(invoice: Invoice): string {
  if (invoice.status === 'sent' && new Date(invoice.due_date) < new Date()) {
    return 'overdue';
  }
  return invoice.status;
}

function formatCHF(amount: number): string {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: 'CHF',
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-CH');
}

type InvoiceWithDetails = Invoice & {
  clients: Client;
  invoice_line_items: InvoiceLineItem[];
};

export default function AdminInvoiceDetailPage() {
  return (
    <ErrorBoundary>
      <AdminInvoiceDetailPageContent />
    </ErrorBoundary>
  );
}

function AdminInvoiceDetailPageContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const organizationId = useAuthStore((state) => state.organizationId);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendToEmail, setSendToEmail] = useState('');
  const [sendCcEmail, setSendCcEmail] = useState('');
  const [sendCcEnabled, setSendCcEnabled] = useState(false);
  const [isOpeningPdf, setIsOpeningPdf] = useState(false);

  // Redirect if no permission — only when role is known (not during loading)
  useEffect(() => {
    if (permissions.role && !permissions.canManageInvoices) {
      router.push('/admin');
    }
  }, [permissions.role, permissions.canManageInvoices, router]);

  // Fetch invoice with client and line items
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

  // Fetch billing settings to know if approval is required
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
  });

  // Status transition mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await fetch(`/api/invoices/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Statusaenderung fehlgeschlagen');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Status aktualisiert');
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-invoices'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Löschen fehlgeschlagen');
    },
    onSuccess: () => {
      toast.success('Rechnung gelöscht');
      queryClient.invalidateQueries({ queryKey: ['admin-invoices'] });
      router.push('/admin/invoices');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Send invoice via email mutation
  const sendInvoiceMutation = useMutation({
    mutationFn: async ({ email, cc_email }: { email: string; cc_email?: string }) => {
      const res = await fetch(`/api/invoices/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, cc_email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Versand fehlgeschlagen');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Rechnung an ${data.sent_to} gesendet`);
      setShowSendDialog(false);
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-invoices'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // PDF preview in new tab
  const hasPdf = !!invoice?.pdf_url;
  const handlePreviewPdf = async () => {
    setIsOpeningPdf(true);
    // Open window immediately to preserve user-gesture context (avoids popup blocker)
    const pdfWindow = window.open('about:blank', '_blank');
    try {
      const res = await fetch(`/api/invoices/${id}/pdf`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'PDF konnte nicht geladen werden' }));
        throw new Error(data.error || 'PDF konnte nicht geladen werden');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (pdfWindow) {
        pdfWindow.location.href = url;
      } else {
        window.open(url, '_blank');
      }
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
    } catch (error) {
      pdfWindow?.close();
      toast.error(error instanceof Error ? error.message : 'PDF konnte nicht geladen werden');
    } finally {
      setIsOpeningPdf(false);
    }
  };

  // Open send dialog with prefilled emails
  const handleOpenSendDialog = () => {
    setSendToEmail(invoice?.clients?.email || '');
    setSendCcEmail(billingSettings?.company_email || '');
    setSendCcEnabled(!!billingSettings?.company_email);
    setShowSendDialog(true);
  };

  if (!permissions.canManageInvoices) {
    return null;
  }

  if (isLoading) {
    return (
      <PageContainer header={<Header title="Rechnung" />}>
        <div className="text-center py-12 text-muted-foreground">Wird geladen...</div>
      </PageContainer>
    );
  }

  if (!invoice) {
    return (
      <PageContainer header={<Header title="Rechnung" />}>
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Rechnung nicht gefunden</p>
        </div>
      </PageContainer>
    );
  }

  const displayStatus = getDisplayStatus(invoice);
  const lineItems = (invoice.invoice_line_items || []).sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const approvalRequired = billingSettings?.approval_required ?? false;
  const isPaidInvoice = invoice.status === 'paid';

  return (
    <PageContainer
      header={
        <Header
          title={`Rechnung ${invoice.invoice_number}`}
        />
      }
    >
      <div className="space-y-4 max-w-3xl mx-auto">
        {/* Back link */}
        <Link
          href="/admin/invoices"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zu Rechnungen
        </Link>

        {/* Status Badge */}
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'px-3 py-1 rounded-full text-sm font-medium',
              getStatusBadgeClasses(displayStatus)
            )}
          >
            {STATUS_LABELS[displayStatus] ?? displayStatus}
          </span>
        </div>

        {/* Invoice Info Card */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Kunde</p>
              <p className="font-medium">{invoice.clients?.name}</p>
              {invoice.clients?.address && (
                <p className="text-sm text-muted-foreground">
                  {invoice.clients.address}
                  {invoice.clients.postal_code || invoice.clients.city
                    ? `, ${invoice.clients.postal_code ?? ''} ${invoice.clients.city ?? ''}`
                    : ''}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Rechnungsnummer</p>
                <p className="text-sm font-medium">{invoice.invoice_number}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rechnungsdatum</p>
                <p className="text-sm">{formatDate(invoice.issue_date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fälligkeitsdatum</p>
                <p className="text-sm">{formatDate(invoice.due_date)}</p>
              </div>
              {invoice.sent_at && (
                <div>
                  <p className="text-xs text-muted-foreground">Gesendet am</p>
                  <p className="text-sm">{formatDate(invoice.sent_at)}</p>
                </div>
              )}
              {invoice.paid_at && (
                <div>
                  <p className="text-xs text-muted-foreground">Bezahlt am</p>
                  <p className="text-sm">{formatDate(invoice.paid_at)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-medium mb-3">Positionen</h3>
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium pb-2 border-b">
              <div className="col-span-5">Beschreibung</div>
              <div className="col-span-1 text-right">Menge</div>
              <div className="col-span-2 text-right">Einheit</div>
              <div className="col-span-2 text-right">Einzelpreis</div>
              <div className="col-span-2 text-right">Gesamt</div>
            </div>
            {/* Rows */}
            {lineItems.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                Keine Positionen
              </div>
            ) : (
              lineItems.map((item) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 py-2 border-b last:border-b-0 text-sm">
                  <div className="col-span-5">
                    <p>{item.description}</p>
                    {item.period_start && item.period_end && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(item.period_start)} - {formatDate(item.period_end)}
                      </p>
                    )}
                  </div>
                  <div className="col-span-1 text-right">
                    {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(2)}
                  </div>
                  <div className="col-span-2 text-right">{item.unit}</div>
                  <div className="col-span-2 text-right">{formatCHF(item.unit_price)}</div>
                  <div className="col-span-2 text-right font-medium">{formatCHF(item.total)}</div>
                </div>
              ))
            )}

            {/* Totals */}
            <div className="mt-3 pt-3 border-t space-y-1">
              <div className="flex justify-between text-sm">
                <span>Zwischensumme</span>
                <span>{formatCHF(invoice.subtotal)}</span>
              </div>
              {invoice.mwst_rate > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{invoice.mwst_rate}% MWST</span>
                  <span>{formatCHF(invoice.mwst_amount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-1">
                <span>Total</span>
                <span>{formatCHF(invoice.total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        {invoice.notes && (
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-2">Bemerkungen</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <Card>
          <CardContent className="p-4 space-y-2">
            {/* PDF Preview */}
            <Button
              variant="outline"
              className="w-full"
              onClick={handlePreviewPdf}
              disabled={isOpeningPdf}
            >
              <Eye className="h-4 w-4 mr-2" />
              {isOpeningPdf
                ? hasPdf
                  ? 'PDF wird geöffnet...'
                  : 'PDF wird generiert...'
                : 'PDF Vorschau'}
            </Button>

            {/* Draft actions */}
            {invoice.status === 'draft' && (
              <>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push(`/admin/invoices/${id}/edit`)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Bearbeiten
                </Button>
                {approvalRequired ? (
                  <Button
                    className="w-full"
                    onClick={() => updateStatusMutation.mutate('pending_approval')}
                    disabled={updateStatusMutation.isPending}
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    Zur Genehmigung einreichen
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={handleOpenSendDialog}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Per E-Mail senden
                  </Button>
                )}
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Löschen
                </Button>
              </>
            )}

            {/* Pending Approval actions */}
            {invoice.status === 'pending_approval' && (
              <>
                <Button
                  className="w-full"
                  onClick={() => updateStatusMutation.mutate('approved')}
                  disabled={updateStatusMutation.isPending}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Genehmigen
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => updateStatusMutation.mutate('draft')}
                  disabled={updateStatusMutation.isPending}
                >
                  <X className="h-4 w-4 mr-2" />
                  Ablehnen
                </Button>
              </>
            )}

            {/* Approved actions */}
            {invoice.status === 'approved' && (
              <Button
                className="w-full"
                onClick={handleOpenSendDialog}
              >
                <Send className="h-4 w-4 mr-2" />
                Per E-Mail senden
              </Button>
            )}

            {/* Sent actions */}
            {invoice.status === 'sent' && (
              <>
                <Button
                  className="w-full"
                  onClick={() => updateStatusMutation.mutate('paid')}
                  disabled={updateStatusMutation.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Als bezahlt markieren
                </Button>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setShowCancelDialog(true)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Stornieren
                </Button>
              </>
            )}

            {/* Paid actions */}
            {invoice.status === 'paid' && (
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setShowCancelDialog(true)}
              >
                <X className="h-4 w-4 mr-2" />
                Stornieren
              </Button>
            )}

            {/* Cancelled actions */}
            {invoice.status === 'cancelled' && (
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Löschen
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechnung löschen</DialogTitle>
            <DialogDescription>
              Möchten Sie die Rechnung {invoice.invoice_number} wirklich löschen? Diese Aktion kann nicht
              rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteMutation.mutate();
                setShowDeleteDialog(false);
              }}
              disabled={deleteMutation.isPending}
            >
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechnung stornieren</DialogTitle>
            <DialogDescription>
              {isPaidInvoice
                ? 'Möchten Sie diese bezahlte Rechnung wirklich stornieren? Zeiteinträge werden wieder freigegeben.'
                : `Möchten Sie die Rechnung ${invoice.invoice_number} wirklich stornieren?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                updateStatusMutation.mutate('cancelled');
                setShowCancelDialog(false);
              }}
              disabled={updateStatusMutation.isPending}
            >
              Stornieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Confirmation Dialog */}
      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechnung versenden</DialogTitle>
            <DialogDescription>
              Rechnung {invoice.invoice_number} per E-Mail versenden
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="send-to">An</Label>
              <Input
                id="send-to"
                type="email"
                value={sendToEmail}
                onChange={(e) => setSendToEmail(e.target.value)}
                placeholder="E-Mail-Adresse des Empfängers"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  id="send-cc-enabled"
                  type="checkbox"
                  checked={sendCcEnabled}
                  onChange={(e) => setSendCcEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="send-cc-enabled">Kopie an (CC)</Label>
              </div>
              {sendCcEnabled && (
                <Input
                  id="send-cc"
                  type="email"
                  value={sendCcEmail}
                  onChange={(e) => setSendCcEmail(e.target.value)}
                  placeholder="CC E-Mail-Adresse"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendDialog(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => {
                sendInvoiceMutation.mutate({
                  email: sendToEmail,
                  cc_email: sendCcEnabled ? sendCcEmail : undefined,
                });
              }}
              disabled={sendInvoiceMutation.isPending || !sendToEmail}
            >
              <Send className="h-4 w-4 mr-2" />
              {sendInvoiceMutation.isPending ? 'Wird gesendet...' : 'Senden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
