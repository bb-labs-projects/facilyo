import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

interface CreateInvoiceLineItem {
  line_type: 'subscription' | 'hours' | 'manual';
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  subscription_id?: string;
  period_start?: string;
  period_end?: string;
  time_entry_ids?: string[];
}

interface CreateInvoiceBody {
  client_id: string;
  issue_date: string;
  due_date: string;
  notes?: string;
  internal_notes?: string;
  mwst_rate: number;
  line_items: CreateInvoiceLineItem[];
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  try {
    // 1. Auth check
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Nicht authentifiziert' },
        { status: 401 }
      );
    }

    // 2. Get user's profile to check org_id and role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profil nicht gefunden' },
        { status: 404 }
      );
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

    // 4. Use service role client for atomic operations
    const serviceClient = createServiceRoleClient();

    // 5. Parse request body
    const body: CreateInvoiceBody = await request.json();
    const { client_id, issue_date, due_date, notes, internal_notes, mwst_rate, line_items } = body;

    if (!client_id || !due_date || !line_items || line_items.length === 0) {
      return NextResponse.json(
        { error: 'client_id, due_date und mindestens eine Position sind erforderlich' },
        { status: 400 }
      );
    }

    // 6. Read billing settings and compute invoice number
    const { data: billingSettings, error: bsError } = await (serviceClient as any)
      .from('organization_billing_settings')
      .select('invoice_number_prefix, next_invoice_number')
      .eq('organization_id', organizationId)
      .single();

    if (bsError || !billingSettings) {
      return NextResponse.json(
        { error: 'Abrechnungseinstellungen nicht gefunden. Bitte zuerst konfigurieren.' },
        { status: 400 }
      );
    }

    const prefix = billingSettings.invoice_number_prefix;
    const nextNumber = billingSettings.next_invoice_number;
    const invoiceNumber = `${prefix}-${String(nextNumber).padStart(4, '0')}`;

    // 7. Calculate subtotal, mwst_amount, total
    const subtotal = line_items.reduce((sum, item) => sum + item.total, 0);
    const mwstAmount = Math.round(subtotal * (mwst_rate / 100) * 100) / 100;
    const total = Math.round((subtotal + mwstAmount) * 100) / 100;

    // 8. Insert invoice (UNIQUE constraint on (organization_id, invoice_number) protects against races)
    const { data: invoice, error: invoiceError } = await (serviceClient as any)
      .from('invoices')
      .insert({
        organization_id: organizationId,
        client_id,
        invoice_number: invoiceNumber,
        status: 'draft',
        issue_date: issue_date || new Date().toISOString().split('T')[0],
        due_date,
        subtotal,
        mwst_rate: mwst_rate,
        mwst_amount: mwstAmount,
        total,
        notes: notes || null,
        internal_notes: internal_notes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (invoiceError) {
      // If unique constraint violation, likely a race condition
      if (invoiceError.code === '23505') {
        return NextResponse.json(
          { error: 'Rechnungsnummer bereits vergeben. Bitte versuchen Sie es erneut.' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: `Fehler beim Erstellen der Rechnung: ${invoiceError.message}` },
        { status: 500 }
      );
    }

    // Update next_invoice_number
    const { error: updateNumberError } = await (serviceClient as any)
      .from('organization_billing_settings')
      .update({ next_invoice_number: nextNumber + 1 })
      .eq('organization_id', organizationId);

    if (updateNumberError) {
      console.error('Failed to update next_invoice_number:', updateNumberError);
    }

    // 9. Insert line items
    const lineItemInserts = line_items.map((item, index) => ({
      organization_id: organizationId,
      invoice_id: invoice.id,
      line_type: item.line_type,
      sort_order: index,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      total: item.total,
      subscription_id: item.subscription_id || null,
      period_start: item.period_start || null,
      period_end: item.period_end || null,
    }));

    const { data: insertedLineItems, error: lineItemsError } = await (serviceClient as any)
      .from('invoice_line_items')
      .insert(lineItemInserts)
      .select();

    if (lineItemsError) {
      // Rollback: delete the invoice (cascade will clean up)
      await (serviceClient as any).from('invoices').delete().eq('id', invoice.id);
      return NextResponse.json(
        { error: `Fehler beim Erstellen der Positionen: ${lineItemsError.message}` },
        { status: 500 }
      );
    }

    // 10. Insert invoice_time_entries for hours line items
    if (insertedLineItems) {
      const timeEntryInserts: Array<{
        organization_id: string;
        invoice_line_item_id: string;
        time_entry_id: string;
      }> = [];

      for (let i = 0; i < line_items.length; i++) {
        const item = line_items[i];
        if (item.line_type === 'hours' && item.time_entry_ids && item.time_entry_ids.length > 0) {
          const lineItem = insertedLineItems[i];
          if (lineItem) {
            for (const timeEntryId of item.time_entry_ids) {
              timeEntryInserts.push({
                organization_id: organizationId,
                invoice_line_item_id: lineItem.id,
                time_entry_id: timeEntryId,
              });
            }
          }
        }
      }

      if (timeEntryInserts.length > 0) {
        const { error: timeEntriesError } = await (serviceClient as any)
          .from('invoice_time_entries')
          .insert(timeEntryInserts);

        if (timeEntriesError) {
          // Rollback: delete the invoice (cascade will clean up line items and time entries)
          await (serviceClient as any).from('invoices').delete().eq('id', invoice.id);
          return NextResponse.json(
            { error: `Fehler beim Verknüpfen der Zeiteinträge: ${timeEntriesError.message}` },
            { status: 500 }
          );
        }
      }
    }

    // 11. Return the created invoice
    const { data: fullInvoice } = await (serviceClient as any)
      .from('invoices')
      .select('*, clients(*), invoice_line_items(*)')
      .eq('id', invoice.id)
      .single();

    return NextResponse.json(fullInvoice, { status: 201 });
  } catch (error) {
    console.error('Create invoice error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Ein unerwarteter Fehler ist aufgetreten: ${errorMessage}` },
      { status: 500 }
    );
  }
}
