import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { notificationRouter } from './routes/notifications';
import { startNotificationWorker } from './workers/notification-worker';
import { logger } from '@ap-bps/shared';

const app = express();
const PORT = process.env.NOTIFICATION_SERVICE_PORT ?? 3006;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'notification-service' }));
app.use('/api/notifications', notificationRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Notification error', { message: err.message });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

startNotificationWorker();
app.listen(PORT, () => logger.info(`Notification Service running on port ${PORT}`));
