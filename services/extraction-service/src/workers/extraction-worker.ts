import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import fs from 'fs';
import path from 'path';
import { db, logger } from '@ap-bps/shared';
import type { QueueJobPayload, AIProvider } from '@ap-bps/shared';
import { getProvider } from '../providers/factory';
import { extractTextAndImage } from '../utils/ocr';
import { getActiveExtractionFields } from '../utils/extraction-fields';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

function resolveDocumentPath(storagePath: string): string {
  if (!storagePath) return storagePath;
  if (path.isAbsolute(storagePath)) return storagePath;

  const candidates = [
    path.resolve(process.cwd(), storagePath),
    path.resolve(process.cwd(), 'services', 'ingestion-service', storagePath),
    path.resolve(process.cwd(), '..', 'ingestion-service', storagePath),
    path.resolve(__dirname, '..', '..', '..', 'services', 'ingestion-service', storagePath),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return path.resolve(process.cwd(), storagePath);
}

async function processExtractionJob(job: Job<QueueJobPayload>): Promise<void> {
  const { invoice_id, document_id, ai_provider, ai_model } = job.data;
  const provider = (ai_provider as AIProvider) ?? (process.env.DEFAULT_AI_PROVIDER as AIProvider) ?? 'openai';

  logger.info('Starting extraction job', {
    invoice_id,
    document_id,
    provider,
    model: ai_model,
    jobId: job.id,
    attemptsMade: job.attemptsMade,
  });

  // Mark invoice as processing
  await db('invoices')
    .where({ invoice_id })
    .update({
      status: 'processing',
      extraction_last_status: 'processing',
      extraction_last_job_id: String(job.id),
      ai_provider_used: provider,
      updated_at: db.fn.now(),
    });
  logger.info('Marked invoice as processing for extraction', { invoice_id, jobId: job.id });

  // Fetch document
  const doc = await db('documents').where({ document_id }).first();
  if (!doc) {
    await db('invoices').where({ invoice_id }).update({ status: 'error', updated_at: db.fn.now() });
    throw new Error(`Document ${document_id} not found`);
  }

  // OCR / text extraction
  const resolvedStoragePath = resolveDocumentPath(doc.storage_path);
  if (resolvedStoragePath !== doc.storage_path && fs.existsSync(resolvedStoragePath)) {
    await db('documents').where({ document_id }).update({ storage_path: resolvedStoragePath });
  }
  const ocrResult = await extractTextAndImage(resolvedStoragePath, doc.mime_type);
  logger.info('OCR completed for extraction', {
    invoice_id,
    jobId: job.id,
    textChars: ocrResult.text?.length ?? 0,
    hasImage: !!ocrResult.imageBase64,
    mimeType: ocrResult.mimeType ?? doc.mime_type,
  });

  // Save OCR text to document
  await db('documents').where({ document_id }).update({
    ocr_text: ocrResult.text,
    ocr_metadata: ocrResult.metadata ?? null,
  });

  // AI extraction
  const customFields = await getActiveExtractionFields();
  const aiProvider = getProvider(provider);
  const extracted = await aiProvider.extract({
    text: ocrResult.text,
    imageBase64: ocrResult.imageBase64,
    imagePages: ocrResult.imagePages?.map((p) => ({ page: p.page, imageBase64: p.imageBase64, mimeType: p.mimeType })),
    mimeType: ocrResult.mimeType ?? doc.mime_type,
    filename: doc.original_filename,
    filePath: resolvedStoragePath,
    model: ai_model,
    customFields,
  });
  logger.info('AI extraction response parsed', {
    invoice_id,
    jobId: job.id,
    confidence: extracted.confidence_score,
    invoice_number: extracted.invoice_number,
  });

  // Save extraction payload to document
  await db('documents').where({ document_id }).update({
    extraction_payload: JSON.stringify(extracted),
    page_count: ocrResult.pageCount ?? null,
  });

  // Determine next status based on confidence
  const CONFIDENCE_THRESHOLD = 0.7;
  const nextStatus = extracted.confidence_score >= CONFIDENCE_THRESHOLD ? 'extracted' : 'verification';

  // Update invoice with extracted data
  const invoiceUpdates: Record<string, unknown> = {
    status: nextStatus,
    extraction_last_status: 'completed',
    confidence_score: extracted.confidence_score,
    invoice_number: extracted.invoice_number,
    invoice_date: extracted.invoice_date,
    due_date: extracted.due_date,
    subtotal: extracted.subtotal,
    tax: extracted.tax,
    total: extracted.total,
    currency: extracted.currency ?? 'USD',
    po_reference: extracted.po_reference,
    updated_at: db.fn.now(),
  };

  // Try to match vendor by name or tax ID
  if (extracted.vendor_name || extracted.vendor_tax_id) {
    const vendor = await db('vendors').where((qb) => {
      if (extracted.vendor_tax_id) qb.where('tax_id', extracted.vendor_tax_id);
      if (extracted.vendor_name) qb.orWhereILike('legal_name', `%${extracted.vendor_name}%`);
    }).first();
    if (vendor) invoiceUpdates.vendor_id = vendor.vendor_id;
    else {
      invoiceUpdates.status = 'verification';
      invoiceUpdates.exception_type = 'unknown_vendor';
      invoiceUpdates.exception_notes = `Could not match vendor: ${extracted.vendor_name ?? extracted.vendor_tax_id}`;
    }
  }

  await db('invoices').where({ invoice_id }).update(invoiceUpdates);
  logger.info('Invoice updated from extraction output', { invoice_id, jobId: job.id, nextStatus: invoiceUpdates.status });

  // Insert line items
  if (extracted.line_items.length > 0) {
    await db('line_items').where({ invoice_id }).del();
    await db('line_items').insert(
      extracted.line_items.map((li, idx) => ({
        invoice_id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        amount: li.amount,
        tax_code: li.tax_code,
        po_line_reference: li.po_line_reference,
        sort_order: idx,
      })),
    );
    logger.info('Line items replaced from extraction output', { invoice_id, jobId: job.id, count: extracted.line_items.length });
  }

  // Enqueue validation
  const { Queue } = await import('bullmq');
  const validationQueue = new Queue('invoice-validation', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: { age: 3600 },
    },
  });
  await validationQueue.add('validate', { invoice_id }, { jobId: `validate-${invoice_id}` });
  logger.info('Validation job enqueued after extraction', { invoice_id, extractJobId: job.id, validateJobId: `validate-${invoice_id}` });

  logger.info('Extraction complete', {
    invoice_id,
    provider,
    model: ai_model,
    confidence: extracted.confidence_score,
    status: nextStatus,
  });
}

export function startExtractionWorker(): Worker<QueueJobPayload> {
  const worker = new Worker<QueueJobPayload>(
    'invoice-extraction',
    processExtractionJob,
    {
      connection,
      concurrency: Number(process.env.EXTRACTION_CONCURRENCY ?? 3),
    },
  );

  worker.on('completed', (job) =>
    logger.info('Extraction job completed', {
      jobId: job.id,
      invoice_id: job.data?.invoice_id,
      document_id: job.data?.document_id,
    }));
  worker.on('failed', async (job, err) => {
    logger.error('Extraction job failed', { jobId: job?.id, error: err.message });
    const invoiceId = job?.data?.invoice_id;
    if (invoiceId) {
      try {
        await db('invoices')
          .where({ invoice_id: invoiceId })
          .update({
            extraction_last_status: 'failed',
            status: 'error',
            updated_at: db.fn.now(),
          });
      } catch (updateErr) {
        logger.warn('Failed to persist extraction failure status', updateErr);
      }
    }
  });

  logger.info('Extraction worker started');
  return worker;
}
