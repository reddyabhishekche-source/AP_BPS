import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import { intakeRouter } from './routes/intake';
import { invoiceRouter } from './routes/invoices';
import { adminRouter } from './routes/admin';
import { startEmailPoller } from './workers/email-poller';
import { logger } from '@ap-bps/shared';

const app = express();
const PORT = process.env.INGESTION_SERVICE_PORT ?? 3001;

// Ensure upload directory exists
const uploadDir = path.resolve(process.cwd(), process.env.STORAGE_PATH ?? './uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(helmet());
app.use(cors());
app.use(express.json());

// Serve uploaded files (for the document viewer)
app.use('/files', express.static(path.resolve(uploadDir)));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ingestion-service' }));

app.use('/api/invoices/intake', intakeRouter);
app.use('/api/invoices', invoiceRouter);
app.use('/api/admin', adminRouter);

// Start email poller
startEmailPoller().catch((err) => logger.error('Email poller failed to start', err));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Ingestion error', { message: err.message });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => logger.info(`Ingestion Service running on port ${PORT}`));
