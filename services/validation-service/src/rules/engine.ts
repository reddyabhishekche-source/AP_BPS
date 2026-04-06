import { db } from '@ap-bps/shared';
import type { ValidationResult, ExceptionType } from '@ap-bps/shared';

export async function runValidationRules(invoiceId: string): Promise<ValidationResult> {
  const errors: ValidationResult['errors'] = [];
  const warnings: ValidationResult['warnings'] = [];
  let exception_type: ExceptionType | null = null;

  const invoice = await db('invoices as i')
    .leftJoin('vendors as v', 'i.vendor_id', 'v.vendor_id')
    .select('i.*', 'v.legal_name as vendor_name', 'v.status as vendor_status')
    .where('i.invoice_id', invoiceId)
    .first();

  if (!invoice) {
    return { valid: false, errors: [{ field: 'invoice_id', message: 'Invoice not found' }], warnings: [], exception_type: 'validation_error' };
  }

  // Required fields
  if (!invoice.invoice_number) errors.push({ field: 'invoice_number', message: 'Invoice number is required' });
  if (!invoice.invoice_date) errors.push({ field: 'invoice_date', message: 'Invoice date is required' });
  if (!invoice.total) errors.push({ field: 'total', message: 'Invoice total is required' });

  // Vendor validation
  if (!invoice.vendor_id) {
    errors.push({ field: 'vendor_id', message: 'Vendor could not be identified' });
    exception_type = 'unknown_vendor';
  } else if (invoice.vendor_status !== 'active') {
    errors.push({ field: 'vendor_id', message: `Vendor is not active (status: ${invoice.vendor_status})` });
  }

  // Duplicate detection
  if (invoice.invoice_number && invoice.vendor_id) {
    const duplicate = await db('invoices')
      .where('invoice_number', invoice.invoice_number)
      .where('vendor_id', invoice.vendor_id)
      .whereNot('invoice_id', invoiceId)
      .whereNotIn('status', ['rejected', 'error'])
      .first();
    if (duplicate) {
      errors.push({ field: 'invoice_number', message: `Duplicate invoice detected (invoice_id: ${duplicate.invoice_id})` });
      if (!exception_type) exception_type = 'duplicate_suspicion';
    }
  }

  // Amount reconciliation
  if (invoice.subtotal != null && invoice.tax != null && invoice.total != null) {
    const expectedTotal = Number(invoice.subtotal) + Number(invoice.tax);
    const diff = Math.abs(expectedTotal - Number(invoice.total));
    if (diff > 0.02) {
      errors.push({ field: 'total', message: `Header total ${invoice.total} does not match subtotal+tax ${expectedTotal.toFixed(2)}` });
      if (!exception_type) exception_type = 'amount_mismatch';
    }
  }

  // Line items sum check
  const lineItems = await db('line_items').where({ invoice_id: invoiceId });
  if (lineItems.length > 0) {
    const lineSum = lineItems.reduce((sum: number, li: { amount: number }) => sum + Number(li.amount ?? 0), 0);
    const diff = Math.abs(lineSum - Number(invoice.subtotal ?? 0));
    if (invoice.subtotal != null && diff > 0.02) {
      warnings.push({ field: 'line_items', message: `Line item sum ${lineSum.toFixed(2)} differs from subtotal ${invoice.subtotal}` });
    }
  }

  // PO matching
  if (invoice.po_reference) {
    const po = await db('purchase_orders').where({ po_number: invoice.po_reference, status: 'open' }).first();
    if (!po) {
      errors.push({ field: 'po_reference', message: `PO ${invoice.po_reference} not found or not open` });
      if (!exception_type) exception_type = 'missing_po';
    } else if (po.amount_limit != null && Number(invoice.total) > Number(po.amount_limit) * (1 + Number(po.tolerance_percent) / 100)) {
      errors.push({ field: 'total', message: `Invoice total ${invoice.total} exceeds PO limit ${po.amount_limit} with tolerance ${po.tolerance_percent}%` });
      if (!exception_type) exception_type = 'amount_mismatch';
    }
  }

  // Confidence score warning
  if (invoice.confidence_score != null && Number(invoice.confidence_score) < 0.7) {
    warnings.push({ field: 'confidence_score', message: `Low OCR/extraction confidence: ${(Number(invoice.confidence_score) * 100).toFixed(0)}%` });
    if (!exception_type) exception_type = 'low_confidence';
  }

  const valid = errors.length === 0;
  return { valid, errors, warnings, exception_type };
}
