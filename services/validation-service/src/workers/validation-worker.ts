import { Worker, Queue, Job } from 'bullmq';
import IORedis from 'ioredis';
import { db, logger } from '@ap-bps/shared';
import { runValidationRules } from '../rules/engine';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

async function processValidationJob(job: Job<{ invoice_id: string }>): Promise<void> {
  const { invoice_id } = job.data;
  logger.info('Running validation', { invoice_id });

  const result = await runValidationRules(invoice_id);

  if (result.valid) {
    await db('invoices').where({ invoice_id }).update({
      status: 'validated',
      exception_type: null,
      exception_notes: null,
      updated_at: db.fn.now(),
    });

    // Enqueue for approval
    const approvalQueue = new Queue('invoice-approval', {
      connection,
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: { age: 3600 } },
    });
    await approvalQueue.add('route-approval', { invoice_id }, { jobId: `approval-${invoice_id}` });
  } else {
    await db('invoices').where({ invoice_id }).update({
      status: 'verification',
      exception_type: result.exception_type,
      exception_notes: [...result.errors.map((e) => `${e.field}: ${e.message}`), ...result.warnings.map((w) => `WARN ${w.field}: ${w.message}`)].join(' | '),
      updated_at: db.fn.now(),
    });
    logger.warn('Validation failed, invoice sent to verification', { invoice_id, errors: result.errors.length });
  }
}

export function startValidationWorker(): Worker<{ invoice_id: string }> {
  const worker = new Worker<{ invoice_id: string }>(
    'invoice-validation',
    processValidationJob,
    { connection, concurrency: 5 },
  );
  worker.on('completed', (job) => logger.info('Validation job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('Validation job failed', { jobId: job?.id, error: err.message }));
  logger.info('Validation worker started');
  return worker;
}
