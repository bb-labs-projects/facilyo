import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { InvoiceStatus } from '@/types/database';

interface StatusUpdateBody {
  status: string;
  approved_by?: string;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'sent'],
  pending_approval: ['approved', 'draft'],
  approved: ['sent'],
  sent: ['paid', 'cancelled'],
  paid: ['cancelled'],
};

/**
 * PATCH /api/invoices/[id]/status
 * Transition an invoice's status with validation.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
        { error: 'Keine Berechtigung für Statusänderungen' },
        { status: 403 }
      );
    }

    // Fetch the invoice
    const { data: invoice, error: invoiceError } = await (supabase as any)
      .from('invoices')
      .select('id, organization_id, status')
      .eq('id', id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: 'Rechnung nicht gefunden' },
        { status: 404 }
      );
    }

    // Verify org membership
    if (invoice.organization_id !== organizationId) {
      return NextResponse.json(
        { error: 'Rechnung nicht gefunden' },
        { status: 404 }
      );
    }

    // Parse body
    const body: StatusUpdateBody = await request.json();
    const newStatus = body.status;

    if (!newStatus) {
      return NextResponse.json(
        { error: 'Status ist erforderlich' },
        { status: 400 }
      );
    }

    const currentStatus = invoice.status;

    // Check if the transition is valid
    const allowedTransitions = VALID_TRANSITIONS[currentStatus];
    if (!allowedTransitions) {
      return NextResponse.json(
        { error: `Keine Statusübergänge von "${currentStatus}" möglich` },
        { status: 400 }
      );
    }

    // Check approval_required setting for draft -> sent/pending_approval transitions
    if (currentStatus === 'draft') {
      const { data: billingSettings } = await (supabase as any)
        .from('organization_billing_settings')
        .select('approval_required')
        .eq('organization_id', organizationId)
        .single();

      const approvalRequired = billingSettings?.approval_required ?? false;

      if (approvalRequired && newStatus === 'sent') {
        return NextResponse.json(
          { error: 'Genehmigung erforderlich. Rechnung muss zuerst zur Genehmigung eingereicht werden.' },
          { status: 400 }
        );
      }

      if (!approvalRequired && newStatus === 'pending_approval') {
        // Allow it but it's not required — the user can still choose this path
        // No restriction here
      }
    }

    if (!allowedTransitions.includes(newStatus)) {
      return NextResponse.json(
        { error: `Ungültiger Statusübergang von "${currentStatus}" zu "${newStatus}"` },
        { status: 400 }
      );
    }

    // Build update payload based on the target status
    const serviceClient = createServiceRoleClient();
    const updateData: Record<string, unknown> = {
      status: newStatus as InvoiceStatus,
    };

    if (newStatus === 'approved') {
      updateData.approved_by = body.approved_by || user.id;
      updateData.approved_at = new Date().toISOString();
    }

    if (newStatus === 'sent') {
      updateData.sent_at = new Date().toISOString();
    }

    if (newStatus === 'paid') {
      updateData.paid_at = new Date().toISOString();
    }

    // Perform the status update
    const { data: updatedInvoice, error: updateError } = await (serviceClient as any)
      .from('invoices')
      .update(updateData)
      .eq('id', id)
      .select('*, clients(*), invoice_line_items(*)')
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: `Fehler beim Aktualisieren des Status: ${updateError.message}` },
        { status: 500 }
      );
    }

    // When cancelling, delete invoice_time_entries to free time entries for re-invoicing
    if (newStatus === 'cancelled') {
      // Get all line item IDs for this invoice
      const { data: lineItems } = await (serviceClient as any)
        .from('invoice_line_items')
        .select('id')
        .eq('invoice_id', id);

      if (lineItems && lineItems.length > 0) {
        const lineItemIds = lineItems.map((li: any) => li.id);
        const { error: deleteTimeEntriesError } = await (serviceClient as any)
          .from('invoice_time_entries')
          .delete()
          .in('invoice_line_item_id', lineItemIds);

        if (deleteTimeEntriesError) {
          console.error('Failed to delete invoice_time_entries on cancellation:', deleteTimeEntriesError);
        }
      }
    }

    return NextResponse.json(updatedInvoice);
  } catch (error) {
    console.error('Status update error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Ein unerwarteter Fehler ist aufgetreten: ${errorMessage}` },
      { status: 500 }
    );
  }
}
