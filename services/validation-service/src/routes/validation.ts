import { Router, Request, Response } from 'express';
import { db } from '@ap-bps/shared';
import { runValidationRules } from '../rules/engine';

export const validationRouter = Router();

// POST /api/validation/:invoiceId/run
validationRouter.post('/:invoiceId/run', async (req: Request, res: Response) => {
  try {
    const result = await runValidationRules(req.params.invoiceId);
    if (result.valid) {
      await db('invoices').where({ invoice_id: req.params.invoiceId }).update({
        status: 'validated', exception_type: null, exception_notes: null, updated_at: db.fn.now(),
      });
    } else {
      await db('invoices').where({ invoice_id: req.params.invoiceId }).update({
        status: 'verification',
        exception_type: result.exception_type,
        exception_notes: result.errors.map((e) => `${e.field}: ${e.message}`).join(' | '),
        updated_at: db.fn.now(),
      });
    }
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Validation failed' });
  }
});

// GET /api/validation/:invoiceId
validationRouter.get('/:invoiceId', async (req: Request, res: Response) => {
  try {
    const result = await runValidationRules(req.params.invoiceId);
    return res.json({ success: true, data: result });
  } catch {
    return res.status(500).json({ success: false, error: 'Validation check failed' });
  }
});
