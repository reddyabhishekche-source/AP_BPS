import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';
import { syncRouter } from './routes/sync';
import { vendorRouter } from './routes/vendors';
import { poRouter } from './routes/purchase-orders';
import { glRouter } from './routes/gl-codes';
import { runErpSync } from './sync/erp-sync';
import { logger } from '@ap-bps/shared';

const app = express();
const PORT = process.env.ERP_SYNC_SERVICE_PORT ?? 3005;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'erp-sync-service' }));
app.use('/api/erp-sync', syncRouter);
app.use('/api/vendors', vendorRouter);
app.use('/api/purchase-orders', poRouter);
app.use('/api/gl-codes', glRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('ERP Sync error', { message: err.message });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Scheduled sync – every hour by default
const interval = Number(process.env.ERP_SYNC_INTERVAL_MS ?? 3_600_000);
const cronExpr = `0 */${Math.floor(interval / 3_600_000)} * * *`;
cron.schedule(cronExpr, () => {
  runErpSync().catch((err) => logger.error('Scheduled ERP sync failed', err));
});

app.listen(PORT, () => logger.info(`ERP Sync Service running on port ${PORT}`));
