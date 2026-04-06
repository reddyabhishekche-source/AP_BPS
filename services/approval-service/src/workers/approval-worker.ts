import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { db, logger } from '@ap-bps/shared';


console.log("redis url: ",process.env.REDIS_URL)
const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const HIGH_VALUE_THRESHOLD = Number(process.env.HIGH_VALUE_APPROVAL_THRESHOLD ?? 10000);

async function routeApproval(job: Job<{ invoice_id: string }>): Promise<void> {
  const { invoice_id } = job.data;
  const invoice = await db('invoices').where({ invoice_id }).first();
  if (!invoice) return;

  // Determine approver based on amount and whether it has a PO
  let approverRole = 'ap_clerk';
  const total = Number(invoice.total ?? 0);

  if (!invoice.po_reference || total > HIGH_VALUE_THRESHOLD) {
    approverRole = 'finance_manager';
  }

  // Find an approver
  const approver = await db('users')
    .where({ role: approverRole, status: 'active' })
    .where((qb) => {
      if (invoice.vendor_id) {
        qb.where('assigned_company', invoice.currency)  // simplified
          .orWhereNull('assigned_company');
      }
    })
    .first();

  if (!approver) {
    // Fall back to any finance manager
    const fallback = await db('users').where({ role: 'finance_manager', status: 'active' }).first();
    if (!fallback) {
      logger.warn('No approver found for invoice', { invoice_id });
      return;
    }
  }

  const finalApprover = approver ?? await db('users').where({ role: 'finance_manager', status: 'active' }).first();
  if (!finalApprover) return;

  // Create pending approval record
  await db('approvals').insert({
    invoice_id,
    approver_user_id: finalApprover.user_id,
    stage: 1,
    decision: 'pending',
  });

  await db('invoices').where({ invoice_id }).update({ status: 'pending_approval', updated_at: db.fn.now() });

  logger.info('Approval routed', { invoice_id, approver_id: finalApprover.user_id, role: approverRole });
}

export function startApprovalWorker(): Worker<{ invoice_id: string }> {
  const worker = new Worker<{ invoice_id: string }>(
    'invoice-approval',
    routeApproval,
    { connection, concurrency: 5 },
  );
  worker.on('completed', (job) => logger.info('Approval routing done', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('Approval routing failed', { jobId: job?.id, error: err.message }));
  logger.info('Approval worker started');
  return worker;
}
