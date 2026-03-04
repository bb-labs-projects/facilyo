import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getResendClient } from '@/lib/resend';
import { generateAndUploadInvoicePdf } from '@/lib/invoice-pdf';
import type { InvoicePdfData, BillingSettingsData } from '@/lib/invoice-pdf';

/**
 * POST /api/invoices/[id]/send
 * Send an invoice via email using Resend.
 * Attaches the PDF from storage and transitions status to 'sent'.
 *
 * Optional body: { email?: string } to override recipient.
 */
export async function POST(
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

    // 2. Get user's profile to check org and role
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
        { error: 'Keine Berechtigung zum Versenden von Rechnungen' },
        { status: 403 }
      );
    }

    // 3. Fetch the invoice with client data
    const { data: invoice, error: invoiceError } = await (supabase as any)
      .from('invoices')
      .select('*, clients(*)')
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

    // 4. Fetch billing settings for company info and approval check
    const { data: billingSettings } = await (supabase as any)
      .from('organization_billing_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (!billingSettings) {
      return NextResponse.json(
        { error: 'Abrechnungseinstellungen nicht gefunden. Bitte zuerst konfigurieren.' },
        { status: 400 }
      );
    }

    // 5. Check if invoice can be sent based on status and approval settings
    const approvalRequired = billingSettings.approval_required ?? false;
    const currentStatus = invoice.status;

    // Allowed: 'approved', 'sent' (re-send), or 'draft' when no approval required
    if (currentStatus === 'draft' && approvalRequired) {
      return NextResponse.json(
        { error: 'Genehmigung erforderlich. Rechnung muss zuerst genehmigt werden.' },
        { status: 400 }
      );
    }

    if (!['draft', 'approved', 'sent'].includes(currentStatus)) {
      return NextResponse.json(
        { error: `Rechnung kann im Status "${currentStatus}" nicht versendet werden` },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // 6. Generate PDF (always regenerate to ensure it's up-to-date)
    // Fetch full invoice with line items for PDF generation
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

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await generateAndUploadInvoicePdf(
        id,
        organizationId,
        fullInvoice as unknown as InvoicePdfData,
        billingSettings as unknown as BillingSettingsData,
      );
    } catch (pdfError) {
      console.error('PDF generation failed:', pdfError);
      return NextResponse.json(
        { error: 'PDF konnte nicht generiert werden' },
        { status: 500 }
      );
    }

    // 7. Determine recipient email and optional CC
    const body = await request.json().catch(() => ({}));
    const recipientEmail = body.email || invoice.clients?.email;
    const ccEmail = body.cc_email || null;

    if (!recipientEmail) {
      return NextResponse.json(
        { error: 'Keine E-Mail-Adresse für den Kunden hinterlegt' },
        { status: 400 }
      );
    }

    // 8. Build email and send via Resend
    const companyName = billingSettings.company_name || 'Facilyo';
    const fromEmail = billingSettings.company_email || process.env.RESEND_FROM_EMAIL || 'noreply@facilyo.ch';

    const contactPerson = invoice.clients?.contact_person;
    const addressBlock = [
      billingSettings.company_address,
      [billingSettings.company_postal_code, billingSettings.company_city].filter(Boolean).join(' '),
      billingSettings.company_phone ? `Tel: ${billingSettings.company_phone}` : null,
      billingSettings.company_email,
    ].filter(Boolean).join('<br>');

    const resend = getResendClient();

    const { error: sendError } = await resend.emails.send({
      from: `${companyName} <${fromEmail}>`,
      to: recipientEmail,
      cc: ccEmail ? [ccEmail] : undefined,
      subject: `Rechnung ${invoice.invoice_number}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Rechnung ${escapeHtml(invoice.invoice_number)}</h2>
          <p>Guten Tag${contactPerson ? ' ' + escapeHtml(contactPerson) : ''},</p>
          <p>Anbei erhalten Sie die Rechnung <strong>${escapeHtml(invoice.invoice_number)}</strong> über <strong>CHF ${invoice.total.toFixed(2)}</strong>.</p>
          <p>Fällig am: <strong>${formatDate(invoice.due_date)}</strong></p>
          ${invoice.notes ? `<p>${escapeHtml(invoice.notes)}</p>` : ''}
          <p>Die Rechnung ist als PDF-Anhang beigefügt.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            ${addressBlock}
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `${invoice.invoice_number}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    if (sendError) {
      console.error('Resend error:', sendError);
      return NextResponse.json(
        { error: `E-Mail konnte nicht gesendet werden: ${sendError.message}` },
        { status: 500 }
      );
    }

    // 9. Update invoice status and metadata
    const updateData: Record<string, unknown> = {
      sent_at: new Date().toISOString(),
      sent_to_email: recipientEmail,
    };

    // Only transition status if not already 'sent' (re-send case)
    if (currentStatus !== 'sent') {
      updateData.status = 'sent';
    }

    const { data: updatedInvoice, error: updateError } = await (serviceClient as any)
      .from('invoices')
      .update(updateData)
      .eq('id', id)
      .select('*, clients(*), invoice_line_items(*)')
      .single();

    if (updateError) {
      console.error('Failed to update invoice after sending:', updateError);
      return NextResponse.json(
        { error: `E-Mail versendet, aber Status konnte nicht aktualisiert werden: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sent_to: recipientEmail,
      invoice: updatedInvoice,
    });
  } catch (error) {
    console.error('Send invoice error:', error);

    if (error instanceof Error && error.message === 'RESEND_API_KEY environment variable is not set') {
      return NextResponse.json(
        { error: 'E-Mail-Versand ist nicht konfiguriert (RESEND_API_KEY fehlt)' },
        { status: 500 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Ein unerwarteter Fehler ist aufgetreten: ${errorMessage}` },
      { status: 500 }
    );
  }
}

/** Escape HTML special characters to prevent XSS in email content */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Format a date string (YYYY-MM-DD) to Swiss format (DD.MM.YYYY) */
function formatDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return dateStr;
}
