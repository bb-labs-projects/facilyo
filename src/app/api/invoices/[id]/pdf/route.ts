import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateAndUploadInvoicePdf } from '@/lib/invoice-pdf';
import type { InvoicePdfData, BillingSettingsData } from '@/lib/invoice-pdf';

/**
 * GET /api/invoices/[id]/pdf
 * Generate a PDF for the given invoice, upload to storage, and return it.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
        { error: 'Keine Berechtigung für Rechnungsverwaltung' },
        { status: 403 }
      );
    }

    // Fetch invoice with client and line items
    const { data: rawInvoice, error: invoiceError } = await (supabase as any)
      .from('invoices')
      .select('*, clients(*), invoice_line_items(*)')
      .eq('id', id)
      .single();

    if (invoiceError || !rawInvoice) {
      return NextResponse.json(
        { error: 'Rechnung nicht gefunden' },
        { status: 404 }
      );
    }

    const invoice = rawInvoice as unknown as InvoicePdfData;

    if (invoice.organization_id !== organizationId) {
      return NextResponse.json(
        { error: 'Rechnung nicht gefunden' },
        { status: 404 }
      );
    }

    // Fetch billing settings
    const { data: rawBilling, error: billingError } = await (supabase as any)
      .from('organization_billing_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (billingError || !rawBilling) {
      return NextResponse.json(
        { error: 'Abrechnungseinstellungen nicht gefunden. Bitte zuerst konfigurieren.' },
        { status: 400 }
      );
    }

    const billing = rawBilling as unknown as BillingSettingsData;

    // Generate PDF and upload to storage
    const pdfBuffer = await generateAndUploadInvoicePdf(id, organizationId, invoice, billing);

    // Return PDF as response
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Rechnung_${invoice.invoice_number}.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Ein unerwarteter Fehler ist aufgetreten: ${errorMessage}` },
      { status: 500 }
    );
  }
}
