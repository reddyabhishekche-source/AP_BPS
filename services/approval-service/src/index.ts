import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { approvalRouter } from './routes/approvals';
import { startApprovalWorker } from './workers/approval-worker';
import { logger } from '@ap-bps/shared';

const app = express();
const PORT = process.env.APPROVAL_SERVICE_PORT ?? 3004;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'approval-service' }));
app.use('/api/approvals', approvalRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Approval error', { message: err.message });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

startApprovalWorker();
app.listen(PORT, () => logger.info(`Approval Service running on port ${PORT}`));
