import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { extractionRouter } from './routes/extraction';
import { startExtractionWorker } from './workers/extraction-worker';
import { logger } from '@ap-bps/shared';

const app = express();
const PORT = process.env.EXTRACTION_SERVICE_PORT ?? 3002;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'extraction-service' }));

app.use('/api/extraction', extractionRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Extraction error', { message: err.message });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start BullMQ worker
startExtractionWorker();

app.listen(PORT, () => logger.info(`Extraction Service running on port ${PORT}`));
