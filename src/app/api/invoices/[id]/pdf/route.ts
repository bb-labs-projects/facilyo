import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateAndUploadInvoicePdf } from '@/lib/invoice-pdf';
import type { InvoicePdfData, BillingSettingsData } from '@/lib/invoice-pdf';

/**
 * GET /api/invoices/[id]/pdf
 * Serve the stored PDF for the given invoice. Falls back to generating if not stored.
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

    // Fetch invoice (minimal — only need pdf_url, org check, and invoice_number)
    const { data: invoice, error: invoiceError } = await (supabase as any)
      .from('invoices')
      .select('id, organization_id, invoice_number, pdf_url')
      .eq('id', id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: 'Rechnung nicht gefunden' },
        { status: 404 }
      );
    }

    if (invoice.organization_id !== organizationId) {
      return NextResponse.json(
        { error: 'Rechnung nicht gefunden' },
        { status: 404 }
      );
    }

    // Try to serve stored PDF
    if (invoice.pdf_url) {
      const serviceClient = createServiceRoleClient();
      const { data: blob, error: downloadError } = await serviceClient.storage
        .from('invoices')
        .download(invoice.pdf_url);

      if (!downloadError && blob) {
        const buffer = Buffer.from(await blob.arrayBuffer());
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="Rechnung_${invoice.invoice_number}.pdf"`,
          },
        });
      }
      // If download failed, fall through to regeneration
      console.error('Stored PDF download failed, regenerating:', downloadError);
    }

    // Fallback: generate PDF (for legacy invoices without stored PDF)
    const { data: fullInvoice } = await (supabase as any)
      .from('invoices')
      .select('*, clients(*), invoice_line_items(*)')
      .eq('id', id)
      .single();

    if (!fullInvoice) {
      return NextResponse.json(
        { error: 'Rechnung nicht gefunden' },
        { status: 404 }
      );
    }

    const { data: rawBilling } = await (supabase as any)
      .from('organization_billing_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (!rawBilling) {
      return NextResponse.json(
        { error: 'Abrechnungseinstellungen nicht gefunden. Bitte zuerst konfigurieren.' },
        { status: 400 }
      );
    }

    const pdfBuffer = await generateAndUploadInvoicePdf(
      id,
      organizationId,
      fullInvoice as unknown as InvoicePdfData,
      rawBilling as unknown as BillingSettingsData,
    );

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
