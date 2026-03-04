import { jsPDF } from 'jspdf';
import { createServiceRoleClient } from '@/lib/supabase/server';

export interface InvoicePdfData {
  id: string;
  organization_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  mwst_rate: number;
  mwst_amount: number;
  total: number;
  notes: string | null;
  clients: {
    name: string;
    contact_person: string | null;
    address: string | null;
    postal_code: string | null;
    city: string | null;
  } | null;
  invoice_line_items: Array<{
    sort_order: number;
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total: number;
    period_start: string | null;
    period_end: string | null;
  }>;
}

export interface BillingSettingsData {
  company_name: string | null;
  company_address: string | null;
  company_postal_code: string | null;
  company_city: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_website: string | null;
  mwst_number: string | null;
  iban: string | null;
  qr_iban: string | null;
  payment_terms_days: number;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatCHF(amount: number): string {
  return amount.toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function generateInvoicePDF(invoice: InvoicePdfData, billing: BillingSettingsData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const marginLeft = 20;
  const marginRight = 20;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let y = 20;

  // --- Company header (top left) ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  if (billing.company_name) {
    doc.text(billing.company_name, marginLeft, y);
    y += 8;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const companyLines: string[] = [];
  if (billing.company_address) companyLines.push(billing.company_address);
  if (billing.company_postal_code || billing.company_city) {
    companyLines.push(
      [billing.company_postal_code, billing.company_city].filter(Boolean).join(' ')
    );
  }
  if (billing.company_phone) companyLines.push(`Tel: ${billing.company_phone}`);
  if (billing.company_email) companyLines.push(billing.company_email);
  if (billing.company_website) companyLines.push(billing.company_website);
  if (billing.mwst_number) companyLines.push(`MWST-Nr: ${billing.mwst_number}`);

  for (const line of companyLines) {
    doc.text(line, marginLeft, y);
    y += 4;
  }

  // --- Client address block (right side, same height as company header) ---
  const clientStartY = 45;
  const clientX = 120;
  doc.setFontSize(10);
  if (invoice.clients) {
    const client = invoice.clients;
    doc.setFont('helvetica', 'bold');
    doc.text(client.name, clientX, clientStartY);
    doc.setFont('helvetica', 'normal');
    let cy = clientStartY + 5;
    if (client.contact_person) {
      doc.text(client.contact_person, clientX, cy);
      cy += 5;
    }
    if (client.address) {
      doc.text(client.address, clientX, cy);
      cy += 5;
    }
    if (client.postal_code || client.city) {
      doc.text(
        [client.postal_code, client.city].filter(Boolean).join(' '),
        clientX,
        cy
      );
    }
  }

  // --- Invoice title and metadata ---
  y = Math.max(y, 80);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Rechnung', marginLeft, y);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const metaLines = [
    ['Rechnungsnr:', invoice.invoice_number],
    ['Datum:', formatDate(invoice.issue_date)],
    ['Fällig am:', formatDate(invoice.due_date)],
  ];

  for (const [label, value] of metaLines) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, marginLeft, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, marginLeft + 35, y);
    y += 5;
  }

  y += 8;

  // --- Line items table ---
  const colX = {
    pos: marginLeft,
    desc: marginLeft + 12,
    qty: marginLeft + contentWidth - 70,
    unit: marginLeft + contentWidth - 55,
    price: marginLeft + contentWidth - 35,
    total: marginLeft + contentWidth - 12,
  };

  // Table header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Pos', colX.pos, y);
  doc.text('Beschreibung', colX.desc, y);
  doc.text('Menge', colX.qty, y, { align: 'right' });
  doc.text('Einheit', colX.unit, y);
  doc.text('Einzelpreis', colX.price, y, { align: 'right' });
  doc.text('Gesamt', colX.total, y, { align: 'right' });
  y += 2;

  // Header underline
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, marginLeft + contentWidth, y);
  y += 5;

  // Sort line items by sort_order
  const sortedItems = [...invoice.invoice_line_items].sort(
    (a, b) => a.sort_order - b.sort_order
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  for (let i = 0; i < sortedItems.length; i++) {
    const item = sortedItems[i];

    // Check if we need a new page
    if (y > 250) {
      doc.addPage();
      y = 20;
    }

    doc.text(String(i + 1), colX.pos, y);

    // Description - wrap if needed
    const descMaxWidth = colX.qty - colX.desc - 15;
    const descLines = doc.splitTextToSize(item.description, descMaxWidth);
    doc.text(descLines, colX.desc, y);

    doc.text(formatCHF(item.quantity), colX.qty, y, { align: 'right' });
    doc.text(item.unit, colX.unit, y);
    doc.text(formatCHF(item.unit_price), colX.price, y, { align: 'right' });
    doc.text(formatCHF(item.total), colX.total, y, { align: 'right' });

    y += descLines.length > 1 ? descLines.length * 4 : 4;

    // Period info if applicable
    if (item.period_start && item.period_end) {
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(
        `(Zeitraum: ${formatDate(item.period_start)} - ${formatDate(item.period_end)})`,
        colX.desc,
        y
      );
      doc.setFontSize(9);
      doc.setTextColor(0);
      y += 4;
    }

    y += 2;
  }

  // Table bottom line
  y += 2;
  doc.line(marginLeft, y, marginLeft + contentWidth, y);
  y += 6;

  // --- Totals ---
  const totalsX = marginLeft + contentWidth - 60;
  const totalsValX = marginLeft + contentWidth - 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Zwischensumme:', totalsX, y);
  doc.text(`CHF ${formatCHF(invoice.subtotal)}`, totalsValX, y, { align: 'right' });
  y += 6;

  if (invoice.mwst_rate > 0) {
    doc.text(`MWST (${invoice.mwst_rate}%):`, totalsX, y);
    doc.text(`CHF ${formatCHF(invoice.mwst_amount)}`, totalsValX, y, { align: 'right' });
    y += 6;
  }

  // Total bold line
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(totalsX - 5, y - 2, totalsValX + 5, y - 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total:', totalsX, y + 3);
  doc.text(`CHF ${formatCHF(invoice.total)}`, totalsValX, y + 3, { align: 'right' });
  y += 14;

  // --- Notes ---
  if (invoice.notes) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Bemerkungen', marginLeft, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const noteLines = doc.splitTextToSize(invoice.notes, contentWidth);
    doc.text(noteLines, marginLeft, y);
    y += noteLines.length * 4 + 5;
  }

  // --- Payment info ---
  if (y > 245) {
    doc.addPage();
    y = 20;
  }

  y += 5;
  doc.setDrawColor(200);
  doc.setLineWidth(0.2);
  doc.line(marginLeft, y, marginLeft + contentWidth, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Zahlungsinformationen', marginLeft, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `Zahlbar innerhalb von ${billing.payment_terms_days} Tagen`,
    marginLeft,
    y
  );
  y += 5;

  if (billing.iban) {
    doc.text(`IBAN: ${billing.iban}`, marginLeft, y);
    y += 5;
  }

  if (billing.qr_iban) {
    doc.text(`QR-IBAN: ${billing.qr_iban}`, marginLeft, y);
    y += 5;
  }

  // --- Swiss QR-Rechnung payment slip section (text-based placeholder) ---
  y += 5;
  if (y > 250) {
    doc.addPage();
    y = 20;
  }

  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(marginLeft, y, marginLeft + contentWidth, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Zahlteil / Partie de paiement', marginLeft, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  // Creditor info
  doc.setFont('helvetica', 'bold');
  doc.text('Konto / Zahlbar an', marginLeft, y);
  doc.setFont('helvetica', 'normal');
  y += 4;
  if (billing.qr_iban || billing.iban) {
    doc.text(billing.qr_iban || billing.iban || '', marginLeft, y);
    y += 4;
  }
  if (billing.company_name) {
    doc.text(billing.company_name, marginLeft, y);
    y += 4;
  }
  if (billing.company_address) {
    doc.text(billing.company_address, marginLeft, y);
    y += 4;
  }
  if (billing.company_postal_code || billing.company_city) {
    doc.text(
      [billing.company_postal_code, billing.company_city].filter(Boolean).join(' '),
      marginLeft,
      y
    );
    y += 4;
  }

  y += 3;

  // Debtor info
  if (invoice.clients) {
    doc.setFont('helvetica', 'bold');
    doc.text('Zahlbar durch', marginLeft, y);
    doc.setFont('helvetica', 'normal');
    y += 4;
    doc.text(invoice.clients.name, marginLeft, y);
    y += 4;
    if (invoice.clients.address) {
      doc.text(invoice.clients.address, marginLeft, y);
      y += 4;
    }
    if (invoice.clients.postal_code || invoice.clients.city) {
      doc.text(
        [invoice.clients.postal_code, invoice.clients.city].filter(Boolean).join(' '),
        marginLeft,
        y
      );
      y += 4;
    }
  }

  y += 3;

  // Amount
  doc.setFont('helvetica', 'bold');
  doc.text('Währung', marginLeft, y);
  doc.text('Betrag', marginLeft + 25, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.text('CHF', marginLeft, y);
  doc.text(formatCHF(invoice.total), marginLeft + 25, y);

  // Reference
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Referenz', marginLeft, y);
  doc.setFont('helvetica', 'normal');
  y += 4;
  doc.text(invoice.invoice_number, marginLeft, y);

  return doc;
}

/**
 * Generate PDF for an invoice and upload to Supabase Storage.
 * Updates the invoice's pdf_url. Returns the PDF buffer.
 */
export async function generateAndUploadInvoicePdf(
  invoiceId: string,
  organizationId: string,
  invoice: InvoicePdfData,
  billing: BillingSettingsData,
): Promise<Buffer> {
  const doc = generateInvoicePDF(invoice, billing);
  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

  const serviceClient = createServiceRoleClient();
  const storagePath = `${organizationId}/${invoiceId}.pdf`;

  const { error: uploadError } = await serviceClient.storage
    .from('invoices')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('PDF upload error:', uploadError);
  } else {
    await (serviceClient as any)
      .from('invoices')
      .update({ pdf_url: storagePath })
      .eq('id', invoiceId);
  }

  return pdfBuffer;
}
