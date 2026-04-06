import { Router, Request, Response } from 'express';
import { db, logger } from '@ap-bps/shared';

export const notificationRouter = Router();

// GET /api/notifications – list recent notifications (stubbed via approval/invoice events)
notificationRouter.get('/', async (_req: Request, res: Response) => {
  try {
    // Return recent approval decisions as notifications
    const events = await db('approvals as a')
      .join('invoices as i', 'a.invoice_id', 'i.invoice_id')
      .join('users as u', 'a.approver_user_id', 'u.user_id')
      .leftJoin('vendors as v', 'i.vendor_id', 'v.vendor_id')
      .select(
        'a.approval_id as id',
        'a.decision',
        'a.timestamp as created_at',
        'a.comments',
        'i.invoice_number',
        'v.legal_name as vendor_name',
        'u.full_name as actor',
      )
      .whereNot('a.decision', 'pending')
      .orderBy('a.timestamp', 'desc')
      .limit(50);

    return res.json({ success: true, data: events });
  } catch (err) {
    logger.error('Failed to fetch notifications', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});
