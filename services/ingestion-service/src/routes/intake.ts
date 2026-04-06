import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { db, logger } from '@ap-bps/shared';
import { enqueueExtraction } from '../queues/extraction-queue';
import type { AIProvider } from '@ap-bps/shared';

const uploadDir = path.resolve(process.cwd(), process.env.STORAGE_PATH ?? './uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE_MB ?? 25) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'];
    cb(null, allowed.includes(file.mimetype));
  },
});

export const intakeRouter = Router();

// POST /api/invoices/intake/upload
// Accepts single file + optional ai_provider query param
intakeRouter.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No valid file attached' });
  }

  const aiProvider: AIProvider =
    (req.body.ai_provider as AIProvider) ??
    (process.env.DEFAULT_AI_PROVIDER as AIProvider) ??
    'openai';

  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    // Create document record
    const [doc] = await db('documents')
      .insert({
        original_filename: req.file.originalname,
        mime_type: req.file.mimetype,
        storage_path: path.resolve(req.file.path),
        file_size_bytes: req.file.size,
        file_data: fileBuffer,
      })
      .returning('*');

    // Create invoice record
    const [invoice] = await db('invoices')
      .insert({
        raw_document_id: doc.document_id,
        source_channel: 'upload',
        status: 'received',
        currency: 'USD',
      })
      .returning('*');

    // Link document to invoice
    await db('documents').where({ document_id: doc.document_id }).update({ invoice_id: invoice.invoice_id });

    // Enqueue for extraction
    const jobId = await enqueueExtraction(
      { invoice_id: invoice.invoice_id, document_id: doc.document_id, ai_provider: aiProvider },
      `extract-${invoice.invoice_id}-${Date.now()}`,
    );
    await db('invoices')
      .where({ invoice_id: invoice.invoice_id })
      .update({
        extraction_last_status: 'queued',
        extraction_last_job_id: jobId,
        updated_at: db.fn.now(),
      });

    logger.info('Invoice uploaded and queued', { invoice_id: invoice.invoice_id, provider: aiProvider });

    return res.status(201).json({
      success: true,
      data: { invoice_id: invoice.invoice_id, document_id: doc.document_id, status: 'received' },
      message: `Invoice queued for extraction using ${aiProvider}`,
    });
  } catch (err) {
    logger.error('Upload intake error', err);
    return res.status(500).json({ success: false, error: 'Failed to process upload' });
  }
});

// POST /api/invoices/intake/api
// Accepts JSON payload (API-based ingestion)
intakeRouter.post('/api', async (req: Request, res: Response) => {
  const { base64_content, filename, mime_type, ai_provider, metadata } = req.body as {
    base64_content: string;
    filename: string;
    mime_type: string;
    ai_provider?: AIProvider;
    metadata?: Record<string, unknown>;
  };

  if (!base64_content || !filename) {
    return res.status(400).json({ success: false, error: 'base64_content and filename are required' });
  }

  const aiProvider: AIProvider = ai_provider ?? (process.env.DEFAULT_AI_PROVIDER as AIProvider) ?? 'openai';

  try {
    const { writeFileSync } = await import('fs');
    const { v4 } = await import('uuid');
    const ext = filename.split('.').pop() ?? 'bin';
    const storagePath = path.join(uploadDir, `${v4()}.${ext}`);
    const buffer = Buffer.from(base64_content, 'base64');
    writeFileSync(storagePath, buffer);

    const [doc] = await db('documents')
      .insert({
        original_filename: filename,
        mime_type: mime_type ?? 'application/octet-stream',
        storage_path: storagePath,
        file_size_bytes: buffer.length,
        file_data: buffer,
        extraction_payload: metadata ?? null,
      })
      .returning('*');

    const [invoice] = await db('invoices')
      .insert({ raw_document_id: doc.document_id, source_channel: 'api', status: 'received', currency: 'USD' })
      .returning('*');

    await db('documents').where({ document_id: doc.document_id }).update({ invoice_id: invoice.invoice_id });
    const jobId = await enqueueExtraction(
      { invoice_id: invoice.invoice_id, document_id: doc.document_id, ai_provider: aiProvider },
      `extract-${invoice.invoice_id}-${Date.now()}`,
    );
    await db('invoices')
      .where({ invoice_id: invoice.invoice_id })
      .update({
        extraction_last_status: 'queued',
        extraction_last_job_id: jobId,
        updated_at: db.fn.now(),
      });

    return res.status(201).json({ success: true, data: { invoice_id: invoice.invoice_id, status: 'received' } });
  } catch (err) {
    logger.error('API intake error', err);
    return res.status(500).json({ success: false, error: 'Failed to process API intake' });
  }
});
