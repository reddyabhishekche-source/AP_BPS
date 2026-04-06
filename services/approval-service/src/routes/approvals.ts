import { Router, Request, Response } from 'express';
import { db, logger } from '@ap-bps/shared';
import type { ApprovalDecision } from '@ap-bps/shared';

export const approvalRouter = Router();

// GET /api/approvals?user_id=&status=pending
approvalRouter.get('/', async (req: Request, res: Response) => {
  const { user_id, status = 'pending', page = '1', limit = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  try {
    let query = db('approvals as a')
      .join('invoices as i', 'a.invoice_id', 'i.invoice_id')
      .leftJoin('vendors as v', 'i.vendor_id', 'v.vendor_id')
      .join('users as u', 'a.approver_user_id', 'u.user_id')
      .select('a.*', 'i.invoice_number', 'i.total', 'i.currency', 'i.invoice_date', 'i.po_reference',
        'v.legal_name as vendor_name', 'u.full_name as approver_name');

    if (status) query = query.where('a.decision', status);
    if (user_id) query = query.where('a.approver_user_id', user_id);

    const [{ total: count }, items] = await Promise.all([
      query.clone().clearSelect().count('* as total').first(),
      query.orderBy('a.timestamp', 'desc').limit(limitNum).offset(offset),
    ]);

    return res.json({ success: true, data: items, total: Number(count), page: pageNum, limit: limitNum });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch approvals' });
  }
});

// POST /api/approvals/:approvalId/decide
approvalRouter.post('/:approvalId/decide', async (req: Request, res: Response) => {
  const { decision, comments } = req.body as { decision: ApprovalDecision; comments?: string };
  const validDecisions: ApprovalDecision[] = ['approved', 'rejected', 'escalated'];

  if (!validDecisions.includes(decision)) {
    return res.status(400).json({ success: false, error: 'Decision must be approved, rejected, or escalated' });
  }

  try {
    const approval = await db('approvals').where({ approval_id: req.params.approvalId }).first();
    if (!approval) return res.status(404).json({ success: false, error: 'Approval not found' });
    if (approval.decision !== 'pending') {
      return res.status(409).json({ success: false, error: 'Approval already decided' });
    }

    await db('approvals').where({ approval_id: req.params.approvalId }).update({
      decision,
      comments: comments ?? null,
      timestamp: db.fn.now(),
    });

    let newInvoiceStatus: string;
    if (decision === 'approved') newInvoiceStatus = 'approved';
    else if (decision === 'rejected') newInvoiceStatus = 'rejected';
    else newInvoiceStatus = 'pending_approval'; // escalated stays in pending

    await db('invoices').where({ invoice_id: approval.invoice_id }).update({
      status: newInvoiceStatus,
      updated_at: db.fn.now(),
    });

    logger.info('Approval decision recorded', { approval_id: req.params.approvalId, decision });

    // If escalated, create a new pending approval for a higher-level approver
    if (decision === 'escalated') {
      const nextApprover = await db('users')
        .where({ role: 'admin', status: 'active' })
        .first();
      if (nextApprover) {
        await db('approvals').insert({
          invoice_id: approval.invoice_id,
          approver_user_id: nextApprover.user_id,
          stage: approval.stage + 1,
          decision: 'pending',
        });
      }
    }

    return res.json({ success: true, data: { decision, invoice_status: newInvoiceStatus } });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to process approval decision' });
  }
});

// POST /api/approvals/invoice/:invoiceId/post
// Mark approved invoice as posted to ERP
approvalRouter.post('/invoice/:invoiceId/post', async (req: Request, res: Response) => {
  try {
    const invoice = await db('invoices').where({ invoice_id: req.params.invoiceId, status: 'approved' }).first();
    if (!invoice) return res.status(400).json({ success: false, error: 'Invoice must be in approved status' });

    await db('invoices').where({ invoice_id: req.params.invoiceId }).update({
      status: 'posted',
      updated_at: db.fn.now(),
    });

    return res.json({ success: true, message: 'Invoice marked as posted' });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to post invoice' });
  }
});
