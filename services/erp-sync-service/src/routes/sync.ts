import { Router, Request, Response } from 'express';
import { db } from '@ap-bps/shared';
import { runErpSync } from '../sync/erp-sync';

export const syncRouter = Router();

// POST /api/erp-sync/trigger
syncRouter.post('/trigger', async (req: Request, res: Response) => {
  const { company_code } = req.body as { company_code?: string };
  try {
    const result = await runErpSync(company_code);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// GET /api/erp-sync/logs
syncRouter.get('/logs', async (_req: Request, res: Response) => {
  try {
    const logs = await db('erp_sync_log').orderBy('started_at', 'desc').limit(50);
    return res.json({ success: true, data: logs });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch sync logs' });
  }
});
