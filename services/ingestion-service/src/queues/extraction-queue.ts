import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { QueueJobPayload } from '@ap-bps/shared';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const extractionQueue = new Queue<QueueJobPayload>('invoice-extraction', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
});

export async function enqueueExtraction(payload: QueueJobPayload, jobId?: string): Promise<string> {
  const finalJobId = jobId ?? `extract-${payload.invoice_id}`;
  await extractionQueue.add('extract', payload, {
    jobId: finalJobId,
  });
  return finalJobId;
}
