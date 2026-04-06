import { Router, Request, Response } from 'express';
import { db } from '@ap-bps/shared';

export const poRouter = Router();

poRouter.get('/', async (req: Request, res: Response) => {
  const { vendor_id, status = 'open', search, page = '1', limit = '50' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, parseInt(limit));
  const offset = (pageNum - 1) * limitNum;

  try {
    let query = db('purchase_orders as po').leftJoin('vendors as v', 'po.vendor_id', 'v.vendor_id')
      .select('po.*', 'v.legal_name as vendor_name', 'v.erp_vendor_code');

    if (status) query = query.where('po.status', status);
    if (vendor_id) query = query.where('po.vendor_id', vendor_id);
    if (search) query = query.whereILike('po.po_number', `%${search}%`);

    const [{ total }, items] = await Promise.all([
      query.clone().clearSelect().count('* as total').first(),
      query.orderBy('po.created_at', 'desc').limit(limitNum).offset(offset),
    ]);

    return res.json({ success: true, data: items, total: Number(total) });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch POs' });
  }
});
