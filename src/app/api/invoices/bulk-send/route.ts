import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getResendClient } from '@/lib/resend';
import { generateAndUploadInvoicePdf } from '@/lib/invoice-pdf';
import type { InvoicePdfData, BillingSettingsData } from '@/lib/invoice-pdf';

/**
 * POST /api/invoices/bulk-send
 * Send multiple invoices via email.
 * Body: { invoice_ids?: string[] }
 * If invoice_ids not provided, sends all sendable invoices (draft or approved based on settings).
 */
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

    // 3. Fetch billing settings
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

    const approvalRequired = billingSettings.approval_required ?? false;
    const sendableStatus = approvalRequired ? 'approved' : 'draft';

    // 4. Parse body
    const body = await request.json().catch(() => ({}));
    const invoiceIds: string[] | undefined = body.invoice_ids;

    // 5. Fetch invoices to send
    let query = (supabase as any)
      .from('invoices')
      .select('*, clients(*), invoice_line_items(*)')
      .eq('status', sendableStatus);

    if (invoiceIds && invoiceIds.length > 0) {
      query = query.in('id', invoiceIds);
    }

    const { data: invoices, error: invoicesError } = await query;

    if (invoicesError) {
      return NextResponse.json(
        { error: 'Rechnungen konnten nicht geladen werden' },
        { status: 500 }
      );
    }

    if (!invoices || invoices.length === 0) {
      return NextResponse.json(
        { error: 'Keine versandbereiten Rechnungen gefunden' },
        { status: 400 }
      );
    }

    // 6. Send each invoice
    const serviceClient = createServiceRoleClient();
    const resend = getResendClient();
    const companyName = billingSettings.company_name || 'Facilyo';
    const fromEmail = billingSettings.company_email || process.env.RESEND_FROM_EMAIL || 'noreply@facilyo.ch';
    const addressBlock = [
      billingSettings.company_address,
      [billingSettings.company_postal_code, billingSettings.company_city].filter(Boolean).join(' '),
      billingSettings.company_phone ? `Tel: ${billingSettings.company_phone}` : null,
      billingSettings.company_email,
    ].filter(Boolean).join('<br>');

    const results: { invoice_id: string; invoice_number: string; client_name: string; success: boolean; error?: string }[] = [];

    for (const invoice of invoices) {
      try {
        // Get recipient email
        const recipientEmail = invoice.clients?.email;
        if (!recipientEmail) {
          results.push({
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            client_name: invoice.clients?.name || 'Unbekannt',
            success: false,
            error: 'Keine E-Mail-Adresse',
          });
          continue;
        }

        // Get PDF — try stored, fall back to generating
        let pdfBuffer: Buffer;
        const storagePath = invoice.pdf_url || `${organizationId}/${invoice.id}.pdf`;

        const { data: blob, error: downloadError } = await serviceClient.storage
          .from('invoices')
          .download(storagePath);

        if (!downloadError && blob) {
          pdfBuffer = Buffer.from(await blob.arrayBuffer());
        } else {
          try {
            pdfBuffer = await generateAndUploadInvoicePdf(
              invoice.id,
              organizationId,
              invoice as unknown as InvoicePdfData,
              billingSettings as unknown as BillingSettingsData,
            );
          } catch (pdfError) {
            results.push({
              invoice_id: invoice.id,
              invoice_number: invoice.invoice_number,
              client_name: invoice.clients?.name || 'Unbekannt',
              success: false,
              error: 'PDF konnte nicht generiert werden',
            });
            continue;
          }
        }

        // Send email
        const contactPerson = invoice.clients?.contact_person;

        const { error: sendError } = await resend.emails.send({
          from: `${companyName} <${fromEmail}>`,
          to: recipientEmail,
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
          results.push({
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            client_name: invoice.clients?.name || 'Unbekannt',
            success: false,
            error: sendError.message,
          });
          continue;
        }

        // Update invoice status
        await (serviceClient as any)
          .from('invoices')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            sent_to_email: recipientEmail,
          })
          .eq('id', invoice.id);

        results.push({
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          client_name: invoice.clients?.name || 'Unbekannt',
          success: true,
        });
      } catch (err) {
        results.push({
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          client_name: invoice.clients?.name || 'Unbekannt',
          success: false,
          error: err instanceof Error ? err.message : 'Unbekannter Fehler',
        });
      }
    }

    const sent = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({ sent, failed, results });
  } catch (error) {
    console.error('Bulk send error:', error);

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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return dateStr;
}
