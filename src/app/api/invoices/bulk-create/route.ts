import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateAndUploadInvoicePdf } from '@/lib/invoice-pdf';
import type { InvoicePdfData, BillingSettingsData } from '@/lib/invoice-pdf';
import type { SubscriptionInterval } from '@/types/database';

interface BulkCreateBody {
  billing_period_end: string;
}

function getPeriodAmount(yearlyAmount: number, interval: SubscriptionInterval): number {
  switch (interval) {
    case 'monthly': return Math.round((yearlyAmount / 12) * 100) / 100;
    case 'quarterly': return Math.round((yearlyAmount / 4) * 100) / 100;
    case 'half_yearly': return Math.round((yearlyAmount / 2) * 100) / 100;
    case 'annually': return yearlyAmount;
  }
}

function calculatePeriodDates(nextBillingDate: string, interval: SubscriptionInterval): { period_start: string; period_end: string } {
  const start = new Date(nextBillingDate);
  // period_start = first of that month
  const periodStart = new Date(start.getFullYear(), start.getMonth(), 1);

  let periodEnd: Date;
  switch (interval) {
    case 'monthly':
      // end of the same month
      periodEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      break;
    case 'quarterly':
      // end of month + 2 months
      periodEnd = new Date(start.getFullYear(), start.getMonth() + 3, 0);
      break;
    case 'half_yearly':
      periodEnd = new Date(start.getFullYear(), start.getMonth() + 6, 0);
      break;
    case 'annually':
      periodEnd = new Date(start.getFullYear(), start.getMonth() + 12, 0);
      break;
  }

  return {
    period_start: periodStart.toISOString().split('T')[0],
    period_end: periodEnd.toISOString().split('T')[0],
  };
}

function advanceNextBillingDate(nextBillingDate: string, interval: SubscriptionInterval): string {
  const date = new Date(nextBillingDate);
  switch (interval) {
    case 'monthly': date.setMonth(date.getMonth() + 1); break;
    case 'quarterly': date.setMonth(date.getMonth() + 3); break;
    case 'half_yearly': date.setMonth(date.getMonth() + 6); break;
    case 'annually': date.setFullYear(date.getFullYear() + 1); break;
  }
  return date.toISOString().split('T')[0];
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  try {
    // 1. Auth check
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });
    }

    // 2. Get user's profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profil nicht gefunden' }, { status: 404 });
    }

    // 3. Permission check
    const userRole = (profile as { role: string }).role;
    const organizationId = (profile as { organization_id: string }).organization_id;

    if (!['admin', 'owner', 'manager'].includes(userRole)) {
      return NextResponse.json(
        { error: 'Keine Berechtigung zum Erstellen von Rechnungen' },
        { status: 403 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // 4. Parse request body
    const body: BulkCreateBody = await request.json();
    const { billing_period_end } = body;

    if (!billing_period_end) {
      return NextResponse.json(
        { error: 'billing_period_end ist erforderlich' },
        { status: 400 }
      );
    }

    // 5. Fetch billing settings
    const { data: billingSettings, error: bsError } = await (serviceClient as any)
      .from('organization_billing_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (bsError || !billingSettings) {
      return NextResponse.json(
        { error: 'Abrechnungseinstellungen nicht gefunden. Bitte zuerst konfigurieren.' },
        { status: 400 }
      );
    }

    // 6. Fetch active subscriptions with next_billing_date <= billing_period_end
    const { data: subscriptions, error: subError } = await (serviceClient as any)
      .from('client_subscriptions')
      .select('*, clients(id, name, contact_person, email, address, postal_code, city)')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .not('next_billing_date', 'is', null)
      .lte('next_billing_date', billing_period_end);

    if (subError) {
      return NextResponse.json(
        { error: `Fehler beim Laden der Abonnements: ${subError.message}` },
        { status: 500 }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        created: 0,
        skipped: 0,
        details: [],
        skipped_details: [],
      });
    }

    // 7. Check for double-invoicing and group by client
    const skippedDetails: Array<{ subscription_name: string; client_name: string; reason: string }> = [];
    const eligibleSubs: typeof subscriptions = [];

    for (const sub of subscriptions) {
      const { period_start, period_end } = calculatePeriodDates(sub.next_billing_date, sub.interval);

      // Check for overlapping non-cancelled invoice line items
      const { data: existingItems } = await (serviceClient as any)
        .from('invoice_line_items')
        .select('id, invoice_id, invoices!inner(status)')
        .eq('subscription_id', sub.id)
        .neq('invoices.status', 'cancelled')
        .lte('period_start', period_end)
        .gte('period_end', period_start);

      if (existingItems && existingItems.length > 0) {
        skippedDetails.push({
          subscription_name: sub.name,
          client_name: sub.clients?.name || 'Unbekannt',
          reason: 'Bereits abgerechnet fuer diesen Zeitraum',
        });
      } else {
        eligibleSubs.push(sub);
      }
    }

    // 8. Group by client_id
    const clientGroups = new Map<string, typeof eligibleSubs>();
    for (const sub of eligibleSubs) {
      const group = clientGroups.get(sub.client_id) || [];
      group.push(sub);
      clientGroups.set(sub.client_id, group);
    }

    // 9. Create invoices per client
    const createdDetails: Array<{ invoice_id: string; invoice_number: string; client_name: string; total: number }> = [];
    let currentNextNumber = billingSettings.next_invoice_number;
    const prefix = billingSettings.invoice_number_prefix;
    const mwstRate = billingSettings.mwst_enabled ? billingSettings.mwst_rate : 0;
    const today = new Date().toISOString().split('T')[0];
    const dueDate = new Date(Date.now() + billingSettings.payment_terms_days * 86400000).toISOString().split('T')[0];

    for (const [clientId, subs] of Array.from(clientGroups.entries())) {
      const invoiceNumber = `${prefix}-${String(currentNextNumber).padStart(4, '0')}`;
      const clientName = subs[0].clients?.name || 'Unbekannt';

      // Build line items
      const lineItems = subs.map((sub: any, index: number) => {
        const periodAmount = getPeriodAmount(sub.yearly_amount, sub.interval);
        const { period_start, period_end } = calculatePeriodDates(sub.next_billing_date, sub.interval);
        return {
          organization_id: organizationId,
          invoice_id: '', // will be set after invoice insert
          line_type: 'subscription' as const,
          sort_order: index,
          description: sub.name + (sub.description ? ` - ${sub.description}` : ''),
          quantity: 1,
          unit: 'Stk',
          unit_price: periodAmount,
          total: periodAmount,
          subscription_id: sub.id,
          period_start,
          period_end,
        };
      });

      const subtotal = lineItems.reduce((sum: number, item: any) => sum + item.total, 0);
      const mwstAmount = Math.round(subtotal * (mwstRate / 100) * 100) / 100;
      const total = Math.round((subtotal + mwstAmount) * 100) / 100;

      // Insert invoice
      const { data: invoice, error: invoiceError } = await (serviceClient as any)
        .from('invoices')
        .insert({
          organization_id: organizationId,
          client_id: clientId,
          invoice_number: invoiceNumber,
          status: 'draft',
          issue_date: today,
          due_date: dueDate,
          subtotal,
          mwst_rate: mwstRate,
          mwst_amount: mwstAmount,
          total,
          created_by: user.id,
        })
        .select()
        .single();

      if (invoiceError) {
        console.error(`Failed to create invoice for client ${clientId}:`, invoiceError);
        continue;
      }

      // Insert line items
      const lineItemInserts = lineItems.map((item: any) => ({ ...item, invoice_id: invoice.id }));
      const { error: lineItemsError } = await (serviceClient as any)
        .from('invoice_line_items')
        .insert(lineItemInserts);

      if (lineItemsError) {
        console.error(`Failed to create line items for invoice ${invoice.id}:`, lineItemsError);
        await (serviceClient as any).from('invoices').delete().eq('id', invoice.id);
        continue;
      }

      // Advance next_billing_date for each subscription
      for (const sub of subs) {
        const newDate = advanceNextBillingDate(sub.next_billing_date, sub.interval);
        await (serviceClient as any)
          .from('client_subscriptions')
          .update({ next_billing_date: newDate })
          .eq('id', sub.id);
      }

      currentNextNumber++;

      createdDetails.push({
        invoice_id: invoice.id,
        invoice_number: invoiceNumber,
        client_name: clientName,
        total,
      });

      // Generate PDF (non-blocking)
      try {
        const { data: fullInvoice } = await (serviceClient as any)
          .from('invoices')
          .select('*, clients(*), invoice_line_items(*)')
          .eq('id', invoice.id)
          .single();

        if (fullInvoice) {
          await generateAndUploadInvoicePdf(
            invoice.id,
            organizationId,
            fullInvoice as unknown as InvoicePdfData,
            billingSettings as unknown as BillingSettingsData,
          );
        }
      } catch (pdfError) {
        console.error(`PDF generation failed for invoice ${invoice.id}:`, pdfError);
      }
    }

    // Update next_invoice_number
    if (createdDetails.length > 0) {
      await (serviceClient as any)
        .from('organization_billing_settings')
        .update({ next_invoice_number: currentNextNumber })
        .eq('organization_id', organizationId);
    }

    return NextResponse.json({
      created: createdDetails.length,
      skipped: skippedDetails.length,
      details: createdDetails,
      skipped_details: skippedDetails,
    });
  } catch (error) {
    console.error('Bulk create invoices error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Ein unerwarteter Fehler ist aufgetreten: ${errorMessage}` },
      { status: 500 }
    );
  }
}
