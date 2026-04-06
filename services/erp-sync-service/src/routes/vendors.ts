import { Router, Request, Response } from 'express';
import { db } from '@ap-bps/shared';

export const vendorRouter = Router();

vendorRouter.get('/', async (req: Request, res: Response) => {
  const { search, status = 'active', page = '1', limit = '50' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  try {
    let query = db('vendors');
    if (status) query = query.where({ status });
    if (search) query = query.whereILike('legal_name', `%${search}%`).orWhereILike('erp_vendor_code', `%${search}%`);

    const [{ total }, items] = await Promise.all([
      query.clone().count('* as total').first(),
      query.orderBy('legal_name').limit(limitNum).offset(offset),
    ]);

    return res.json({ success: true, data: items, total: Number(total) });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch vendors' });
  }
});

vendorRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const vendor = await db('vendors').where({ vendor_id: req.params.id }).first();
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });
    return res.json({ success: true, data: vendor });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch vendor' });
  }
});
