import { Router, Request, Response } from 'express';
import { db } from '@ap-bps/shared';

export const glRouter = Router();

glRouter.get('/', async (req: Request, res: Response) => {
  const { company_code, is_active = 'true', search } = req.query as Record<string, string>;
  try {
    let query = db('gl_codes');
    if (is_active !== undefined) query = query.where({ is_active: is_active === 'true' });
    if (company_code) query = query.where({ company_code });
    if (search) query = query.whereILike('description', `%${search}%`).orWhereILike('gl_code', `%${search}%`);
    const items = await query.orderBy('gl_code');
    return res.json({ success: true, data: items });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch GL codes' });
  }
});
