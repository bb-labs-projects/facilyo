import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateAndUploadInvoicePdf } from '@/lib/invoice-pdf';
import type { InvoicePdfData, BillingSettingsData } from '@/lib/invoice-pdf';

/**
 * Helper to authenticate the user, verify org membership, and check role permissions.
 * Returns the user, profile, and org info or an error response.
 */
async function authenticateAndAuthorize(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: NextResponse.json(
        { error: 'Nicht authentifiziert' },
        { status: 401 }
      ),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return {
      error: NextResponse.json(
        { error: 'Profil nicht gefunden' },
        { status: 404 }
      ),
    };
  }

  const userRole = (profile as { role: string }).role;
  const organizationId = (profile as { organization_id: string }).organization_id;

  if (!['admin', 'owner', 'manager'].includes(userRole)) {
    return {
      error: NextResponse.json(
        { error: 'Keine Berechtigung für Rechnungsverwaltung' },
        { status: 403 }
      ),
    };
  }

  return { user, profile, userRole, organizationId };
}

/**
 * GET /api/invoices/[id]
 * Fetch a single invoice with line items and client data.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  try {
    const auth = await authenticateAndAuthorize(supabase);
    if ('error' in auth && auth.error) return auth.error;
    const { organizationId } = auth as { organizationId: string };

    const { data: invoice, error: invoiceError } = await (supabase as any)
      .from('invoices')
      .select('*, clients(*), invoice_line_items(*)')
      .eq('id', id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: 'Rechnung nicht gefunden' },
        { status: 404 }
      );
    }

    // Verify the invoice belongs to the user's organization
    if (invoice.organization_id !== organizationId) {
      return NextResponse.json(
        { error: 'Rechnung nicht gefunden' },
        { status: 404 }
      );
    }

    return NextResponse.json(invoice);
  } catch (error) {
    console.error('Get invoice error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Ein unerwarteter Fehler ist aufgetreten: ${errorMessage}` },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/invoices/[id]
 * Update a draft invoice. Only allowed when status is 'draft'.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  try {
    const auth = await authenticateAndAuthorize(supabase);
    if ('error' in auth && auth.error) return auth.error;
    const { organizationId } = auth as { organizationId: string };

    // Fetch the existing invoice to check status and org
    const { data: existingInvoice, error: fetchError } = await (supabase as any)
      .from('invoices')
      .select('id, organization_id, status')
      .eq('id', id)
      .single();

    if (fetchError || !existingInvoice) {
      return NextResponse.json(
        { error: 'Rechnung nicht gefunden' },
        { status: 404 }
      );
    }

    if (existingInvoice.organization_id !== organizationId) {
      return NextResponse.json(
        { error: 'Rechnung nicht gefunden' },
        { status: 404 }
      );
    }

    if (existingInvoice.status !== 'draft') {
      return NextResponse.json(
        { error: 'Nur Entwurfs-Rechnungen können bearbeitet werden' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Build update object with allowed fields only
    const allowedFields = [
      'client_id', 'issue_date', 'due_date', 'notes', 'internal_notes',
      'mwst_rate', 'subtotal', 'mwst_amount', 'total',
    ] as const;

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Update line items if provided
    const serviceClient = createServiceRoleClient();

    if (body.line_items && Array.isArray(body.line_items)) {
      // Delete existing line items (cascade deletes invoice_time_entries)
      await (serviceClient as any)
        .from('invoice_line_items')
        .delete()
        .eq('invoice_id', id);

      // Insert new line items
      const lineItemInserts = body.line_items.map((item: {
        line_type: string;
        description: string;
        quantity: number;
        unit: string;
        unit_price: number;
        total: number;
        subscription_id?: string;
        period_start?: string;
        period_end?: string;
        time_entry_ids?: string[];
      }, index: number) => ({
        organization_id: organizationId,
        invoice_id: id,
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
        return NextResponse.json(
          { error: `Fehler beim Aktualisieren der Positionen: ${lineItemsError.message}` },
          { status: 500 }
        );
      }

      // Re-insert time entry links for hours line items
      if (insertedLineItems) {
        const timeEntryInserts: Array<{
          organization_id: string;
          invoice_line_item_id: string;
          time_entry_id: string;
        }> = [];

        for (let i = 0; i < body.line_items.length; i++) {
          const item = body.line_items[i];
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
            return NextResponse.json(
              { error: `Fehler beim Verknüpfen der Zeiteinträge: ${timeEntriesError.message}` },
              { status: 500 }
            );
          }
        }
      }
    }

    // Update invoice header fields
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await (serviceClient as any)
        .from('invoices')
        .update(updateData)
        .eq('id', id);

      if (updateError) {
        return NextResponse.json(
          { error: `Fehler beim Aktualisieren der Rechnung: ${updateError.message}` },
          { status: 500 }
        );
      }
    }

    // Re-fetch updated invoice
    const { data: updatedInvoice } = await (serviceClient as any)
      .from('invoices')
      .select('*, clients(*), invoice_line_items(*)')
      .eq('id', id)
      .single();

    // Regenerate PDF with updated data (non-blocking)
    if (updatedInvoice) {
      try {
        const { data: rawBilling } = await (serviceClient as any)
          .from('organization_billing_settings')
          .select('*')
          .eq('organization_id', organizationId)
          .single();

        if (rawBilling) {
          await generateAndUploadInvoicePdf(
            id,
            organizationId,
            updatedInvoice as unknown as InvoicePdfData,
            rawBilling as unknown as BillingSettingsData,
          );
        }
      } catch (pdfError) {
        console.error('PDF regeneration after edit failed (non-blocking):', pdfError);
      }
    }

    return NextResponse.json(updatedInvoice);
  } catch (error) {
    console.error('Update invoice error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Ein unerwarteter Fehler ist aufgetreten: ${errorMessage}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/invoices/[id]
 * Delete a draft invoice. Only allowed when status is 'draft'.
 * Cascade deletes line items and invoice_time_entries automatically.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  try {
    const auth = await authenticateAndAuthorize(supabase);
    if ('error' in auth && auth.error) return auth.error;
    const { organizationId } = auth as { organizationId: string };

    // Fetch the existing invoice to check status and org
    const { data: existingInvoice, error: fetchError } = await (supabase as any)
      .from('invoices')
      .select('id, organization_id, status')
      .eq('id', id)
      .single();

    if (fetchError || !existingInvoice) {
      return NextResponse.json(
        { error: 'Rechnung nicht gefunden' },
        { status: 404 }
      );
    }

    if (existingInvoice.organization_id !== organizationId) {
      return NextResponse.json(
        { error: 'Rechnung nicht gefunden' },
        { status: 404 }
      );
    }

    if (existingInvoice.status !== 'draft' && existingInvoice.status !== 'cancelled') {
      return NextResponse.json(
        { error: 'Nur Entwürfe und stornierte Rechnungen können gelöscht werden' },
        { status: 400 }
      );
    }

    // Delete stored PDF from storage (non-blocking)
    const serviceClient = createServiceRoleClient();
    const storagePath = `${organizationId}/${id}.pdf`;
    try {
      await serviceClient.storage.from('invoices').remove([storagePath]);
    } catch (storageError) {
      console.error('PDF storage cleanup failed (non-blocking):', storageError);
    }

    // Delete invoice (cascade handles line items and invoice_time_entries)
    const { error: deleteError } = await (serviceClient as any)
      .from('invoices')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json(
        { error: `Fehler beim Löschen der Rechnung: ${deleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete invoice error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Ein unerwarteter Fehler ist aufgetreten: ${errorMessage}` },
      { status: 500 }
    );
  }
}
