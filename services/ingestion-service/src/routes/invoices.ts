import { Router, Request, Response } from 'express';
import { db } from '@ap-bps/shared';
import fs from 'fs';
import path from 'path';
import type { InvoiceStatus, PaginatedResponse, Invoice } from '@ap-bps/shared';

export const invoiceRouter = Router();

function resolveStoragePath(storagePath?: string | null): string | null {
  if (!storagePath) return null;
  if (path.isAbsolute(storagePath)) return storagePath;
  const candidates = [
    path.resolve(process.cwd(), storagePath),
    path.resolve(process.cwd(), 'services', 'ingestion-service', storagePath),
    path.resolve(process.cwd(), '..', 'ingestion-service', storagePath),
    path.resolve(__dirname, '..', '..', '..', 'ingestion-service', storagePath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.resolve(process.cwd(), storagePath);
}

// GET /api/invoices  – list with filters + pagination
invoiceRouter.get('/', async (req: Request, res: Response) => {
  try {
    const {
      status, vendor_id, source_channel,
      page = '1', limit = '20',
      search, date_from, date_to,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let query = db('invoices as i')
      .leftJoin('vendors as v', 'i.vendor_id', 'v.vendor_id')
      .leftJoin('documents as d', 'i.raw_document_id', 'd.document_id')
      .select(
        'i.*',
        'v.legal_name as vendor_name',
        'v.erp_vendor_code',
        'd.original_filename',
        'd.extraction_payload',
      );

    if (status) query = query.where('i.status', status);
    if (vendor_id) query = query.where('i.vendor_id', vendor_id);
    if (source_channel) query = query.where('i.source_channel', source_channel);
    if (date_from) query = query.where('i.created_at', '>=', date_from);
    if (date_to) query = query.where('i.created_at', '<=', date_to);
    if (search) {
      query = query.where((qb) => {
        qb.whereILike('i.invoice_number', `%${search}%`)
          .orWhereILike('v.legal_name', `%${search}%`);
      });
    }

    const countQuery = query.clone().clearSelect().count('* as total').first();
    const [{ total }, invoices] = await Promise.all([
      countQuery,
      query.orderBy('i.created_at', 'desc').limit(limitNum).offset(offset),
    ]);

    const response: PaginatedResponse<Invoice> = {
      data: invoices,
      total: Number(total),
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(Number(total) / limitNum),
    };

    return res.json({ success: true, ...response });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch invoices' });
  }
});

// GET /api/invoices/stats – dashboard counts
invoiceRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await db('invoices')
      .select('status')
      .count('* as count')
      .groupBy('status');

    const result: Record<string, number> = {};
    for (const row of stats) {
      result[row.status as string] = Number(row.count);
    }

    const aging = await db('invoices')
      .whereIn('status', ['received', 'processing', 'verification', 'validated', 'pending_approval'])
      .select(db.raw(`
        CASE
          WHEN created_at >= NOW() - INTERVAL '1 day' THEN '0-1 days'
          WHEN created_at >= NOW() - INTERVAL '3 days' THEN '1-3 days'
          WHEN created_at >= NOW() - INTERVAL '7 days' THEN '3-7 days'
          ELSE '7+ days'
        END as bucket
      `))
      .count('* as count')
      .groupByRaw('bucket');

    return res.json({ success: true, data: { byStatus: result, aging } });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// GET /api/invoices/:id
invoiceRouter.get('/:id/document', async (req: Request, res: Response) => {
  try {
    const doc = await db('invoices as i')
      .join('documents as d', 'i.raw_document_id', 'd.document_id')
      .select(
        'd.document_id',
        'd.original_filename',
        'd.mime_type',
        'd.storage_path',
        'd.file_data',
      )
      .where('i.invoice_id', req.params.id)
      .first();

    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });

    const filename = doc.original_filename ?? 'document';
    const mimeType = doc.mime_type ?? 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, max-age=60');

    if (doc.file_data) {
      const data = Buffer.isBuffer(doc.file_data) ? doc.file_data : Buffer.from(doc.file_data);
      return res.status(200).send(data);
    }

    const resolved = resolveStoragePath(doc.storage_path);
    if (!resolved || !fs.existsSync(resolved)) {
      return res.status(404).json({ success: false, error: 'Document file missing' });
    }

    return res.status(200).sendFile(path.resolve(resolved));
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch document' });
  }
});

// GET /api/invoices/:id
invoiceRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const invoice = await db('invoices as i')
      .leftJoin('vendors as v', 'i.vendor_id', 'v.vendor_id')
      .leftJoin('documents as d', 'i.raw_document_id', 'd.document_id')
      .leftJoin('purchase_orders as po', 'i.po_reference', 'po.po_number')
      .select(
        'i.*',
        'v.legal_name as vendor_name',
        'v.erp_vendor_code',
        'v.payment_terms',
        'd.original_filename',
        'd.mime_type',
        'd.storage_path',
        'd.ocr_text',
        'd.ocr_metadata',
        'd.extraction_payload',
        'po.amount_limit as po_amount_limit',
        'po.tolerance_percent',
      )
      .where('i.invoice_id', req.params.id)
      .first();

    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });

    const lineItems = await db('line_items').where({ invoice_id: req.params.id }).orderBy('sort_order');
    const approvals = await db('approvals as a')
      .join('users as u', 'a.approver_user_id', 'u.user_id')
      .select('a.*', 'u.full_name as approver_name', 'u.email as approver_email')
      .where('a.invoice_id', req.params.id)
      .orderBy('a.stage');

    return res.json({ success: true, data: { ...invoice, line_items: lineItems, approvals } });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch invoice' });
  }
});

// PATCH /api/invoices/:id  – manual corrections
invoiceRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const invoiceId = req.params.id;
    let deleted = false;
    let filePathToDelete: string | null = null;

    await db.transaction(async (trx) => {
      const invoice = await trx('invoices')
        .where({ invoice_id: invoiceId })
        .first();

      if (!invoice) return;

      deleted = true;
      const rawDocumentId = invoice.raw_document_id as string | null;
      await trx('invoices').where({ invoice_id: invoiceId }).del();

      if (!rawDocumentId) return;

      const [{ refs }] = await trx('invoices')
        .where({ raw_document_id: rawDocumentId })
        .count<{ refs: string }[]>('* as refs');

      if (Number(refs) === 0) {
        const [doc] = await trx('documents')
          .where({ document_id: rawDocumentId })
          .del()
          .returning(['storage_path']);
        filePathToDelete = doc?.storage_path ?? null;
      }
    });

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    if (filePathToDelete) {
      const resolved = resolveStoragePath(filePathToDelete);
      if (resolved && fs.existsSync(resolved)) {
        try { fs.unlinkSync(resolved); } catch { /* best-effort cleanup */ }
      }
    }

    return res.json({ success: true, message: 'Invoice deleted' });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to delete invoice' });
  }
});

// PATCH /api/invoices/:id  – manual corrections
invoiceRouter.patch('/:id', async (req: Request, res: Response) => {
  const allowed: (keyof Invoice)[] = [
    'vendor_id', 'invoice_number', 'invoice_date', 'due_date',
    'subtotal', 'tax', 'total', 'currency', 'po_reference',
    'receipt_reference', 'exception_type', 'exception_notes',
  ];

  const updates: Partial<Invoice> = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, error: 'No valid fields to update' });
  }

  try {
    const [updated] = await db('invoices')
      .where({ invoice_id: req.params.id })
      .update({ ...updates, updated_at: db.fn.now() })
      .returning('*');

    if (!updated) return res.status(404).json({ success: false, error: 'Invoice not found' });

    return res.json({ success: true, data: updated });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to update invoice' });
  }
});

// PATCH /api/invoices/:id/status
invoiceRouter.patch('/:id/status', async (req: Request, res: Response) => {
  const { status } = req.body as { status: InvoiceStatus };
  const validStatuses: InvoiceStatus[] = [
    'received', 'processing', 'extracted', 'verification',
    'validated', 'pending_approval', 'approved', 'rejected', 'posted', 'error',
  ];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' });
  }
  try {
    const [updated] = await db('invoices')
      .where({ invoice_id: req.params.id })
      .update({ status, updated_at: db.fn.now() })
      .returning('*');
    return res.json({ success: true, data: updated });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to update status' });
  }
});

// PUT /api/invoices/:id/line-items  – replace line items
invoiceRouter.put('/:id/line-items', async (req: Request, res: Response) => {
  const { line_items } = req.body as {
    line_items: Array<{
      description: string; quantity: number; unit_price: number;
      amount: number; tax_code?: string; po_line_reference?: string;
      gl_code?: string; cost_center?: string;
    }>;
  };

  try {
    await db.transaction(async (trx) => {
      await trx('line_items').where({ invoice_id: req.params.id }).del();
      if (line_items.length > 0) {
        await trx('line_items').insert(
          line_items.map((li, idx) => ({ ...li, invoice_id: req.params.id, sort_order: idx })),
        );
      }
    });
    const items = await db('line_items').where({ invoice_id: req.params.id }).orderBy('sort_order');
    return res.json({ success: true, data: items });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to update line items' });
  }
});
