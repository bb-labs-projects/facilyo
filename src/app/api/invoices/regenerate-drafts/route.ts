import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateAndUploadInvoicePdf } from '@/lib/invoice-pdf';
import type { InvoicePdfData, BillingSettingsData } from '@/lib/invoice-pdf';

/**
 * POST /api/invoices/regenerate-drafts
 * Regenerate PDFs for all draft invoices in the user's organization.
 * Called after billing settings are updated.
 */
export async function POST() {
  const supabase = await createClient();

  try {
    // Auth check
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Nicht authentifiziert' },
        { status: 401 }
      );
    }

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

    const userRole = (profile as { role: string }).role;
    const organizationId = (profile as { organization_id: string }).organization_id;

    if (!['admin', 'owner', 'manager'].includes(userRole)) {
      return NextResponse.json(
        { error: 'Keine Berechtigung' },
        { status: 403 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Fetch billing settings
    const { data: rawBilling } = await (serviceClient as any)
      .from('organization_billing_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (!rawBilling) {
      return NextResponse.json(
        { error: 'Abrechnungseinstellungen nicht gefunden' },
        { status: 400 }
      );
    }

    const billing = rawBilling as unknown as BillingSettingsData;

    // Fetch all draft invoices with client + line items
    const { data: drafts, error: draftsError } = await (serviceClient as any)
      .from('invoices')
      .select('*, clients(*), invoice_line_items(*)')
      .eq('organization_id', organizationId)
      .eq('status', 'draft');

    if (draftsError) {
      return NextResponse.json(
        { error: `Fehler beim Laden der Entwürfe: ${draftsError.message}` },
        { status: 500 }
      );
    }

    if (!drafts || drafts.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    // Regenerate each draft PDF
    let count = 0;
    for (const draft of drafts) {
      try {
        await generateAndUploadInvoicePdf(
          draft.id,
          organizationId,
          draft as unknown as InvoicePdfData,
          billing,
        );
        count++;
      } catch (pdfError) {
        console.error(`PDF regeneration failed for invoice ${draft.id}:`, pdfError);
      }
    }

    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error('Regenerate drafts error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Ein unerwarteter Fehler ist aufgetreten: ${errorMessage}` },
      { status: 500 }
    );
  }
}
