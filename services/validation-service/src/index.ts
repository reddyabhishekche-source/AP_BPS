import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { validationRouter } from './routes/validation';
import { startValidationWorker } from './workers/validation-worker';
import { logger } from '@ap-bps/shared';

const app = express();
const PORT = process.env.VALIDATION_SERVICE_PORT ?? 3003;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'validation-service' }));
app.use('/api/validation', validationRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Validation error', { message: err.message });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

startValidationWorker();

app.listen(PORT, () => logger.info(`Validation Service running on port ${PORT}`));
