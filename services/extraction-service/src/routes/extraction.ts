import { Router, Request, Response } from 'express';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import OpenAI from 'openai';
import { db, logger } from '@ap-bps/shared';
import type { AIProvider } from '@ap-bps/shared';
import { getProvider } from '../providers/factory';
import { extractTextAndImage } from '../utils/ocr';
import { getActiveExtractionFields } from '../utils/extraction-fields';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const extractionQueue = new Queue('invoice-extraction', {
  connection,
  defaultJobOptions: {
    attempts: Number(process.env.EXTRACTION_MAX_ATTEMPTS ?? 3),
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
});

export const extractionRouter = Router();

const OPENAI_MODEL_CACHE_TTL_MS = 10 * 60 * 1000;
let openaiModelCache: { fetchedAt: number; models: string[] } | null = null;

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function isLikelyOpenAIExtractionModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  const unsupported = [
    'audio',
    'realtime',
    'image',
    'transcribe',
    'tts',
    'search',
    'moderation',
    'embedding',
    'whisper',
  ];
  if (unsupported.some((token) => id.includes(token))) return false;
  return id.startsWith('gpt-');
}

async function getOpenAIModels(): Promise<string[]> {
  const fallback = unique([(process.env.OPENAI_MODEL ?? '').trim(), 'gpt-5.2', 'gpt-5', 'gpt-4.1', 'gpt-4o']);
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fallback;

  const now = Date.now();
  if (openaiModelCache && now - openaiModelCache.fetchedAt < OPENAI_MODEL_CACHE_TTL_MS) {
    return openaiModelCache.models;
  }

  try {
    const client = new OpenAI({ apiKey: key });
    const listed = await client.models.list();
    const discovered = listed.data
      .map((m) => m.id)
      .filter(isLikelyOpenAIExtractionModel)
      .sort((a, b) => a.localeCompare(b));
    const models = unique([(process.env.OPENAI_MODEL ?? '').trim(), ...discovered, ...fallback]);
    openaiModelCache = { fetchedAt: now, models };
    return models;
  } catch (err) {
    logger.warn('Failed to fetch OpenAI models, using fallback list', err);
    return fallback;
  }
}

async function getProviderModels(provider: AIProvider): Promise<string[]> {
  switch (provider) {
    case 'openai':
      return getOpenAIModels();
    case 'anthropic':
      return unique([(process.env.ANTHROPIC_MODEL ?? '').trim(), 'claude-3-5-sonnet-20241022']);
    case 'gemini':
      return unique([(process.env.GEMINI_MODEL ?? '').trim(), 'gemini-1.5-pro']);
    default:
      return [];
  }
}

// POST /api/extraction/:invoiceId/trigger
// Manually re-trigger extraction (e.g., after user selects a different AI provider)
extractionRouter.post('/:invoiceId/trigger', async (req: Request, res: Response) => {
  const { invoiceId } = req.params;
  const { ai_provider, ai_model } = req.body as { ai_provider?: AIProvider; ai_model?: string };
  logger.info('Retry request received', { invoiceId, ai_provider, ai_model });

  try {
    const invoice = await db('invoices').where({ invoice_id: invoiceId }).first();
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    if (!invoice.raw_document_id) {
      logger.warn('Retry rejected: invoice missing raw document id', { invoiceId });
      return res.status(400).json({ success: false, error: 'Cannot retry: source document is missing' });
    }

    const provider: AIProvider =
      ai_provider ?? (process.env.DEFAULT_AI_PROVIDER as AIProvider) ?? 'openai';
    const providerModels = await getProviderModels(provider);
    const defaultModel = providerModels[0];
    const requestedModel = ai_model?.trim();
    const selectedModel =
      requestedModel && providerModels.includes(requestedModel)
        ? requestedModel
        : defaultModel;

    const nextJobId = `extract-${invoiceId}-${Date.now()}`;

    await extractionQueue.add(
      'extract',
      {
        invoice_id: invoiceId,
        document_id: invoice.raw_document_id,
        ai_provider: provider,
        ai_model: selectedModel,
      },
      { jobId: nextJobId },
    );
    logger.info('Retry job enqueued', {
      invoiceId,
      jobId: nextJobId,
      provider,
      model: selectedModel,
      queue: 'invoice-extraction',
    });

    await db('invoices')
      .where({ invoice_id: invoiceId })
      .update({
        status: 'received',
        extraction_last_status: 'queued',
        extraction_last_job_id: nextJobId,
        extraction_retry_count: db.raw('COALESCE(extraction_retry_count, 0) + 1'),
        extraction_last_retried_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
    logger.info('Retry metadata persisted', {
      invoiceId,
      jobId: nextJobId,
      extraction_last_status: 'queued',
    });

    logger.info('Re-triggered extraction', { invoiceId, provider, model: selectedModel });
    const modelSuffix = selectedModel ? ` (${selectedModel})` : '';
    const refreshed = await db('invoices')
      .where({ invoice_id: invoiceId })
      .select('extraction_retry_count', 'extraction_last_retried_at')
      .first();
    return res.json({
      success: true,
      message: `Extraction queued using ${provider}${modelSuffix}`,
      data: {
        job_id: nextJobId,
        retry_count: Number(refreshed?.extraction_retry_count ?? 0),
        last_retried_at: refreshed?.extraction_last_retried_at ?? null,
      },
    });
  } catch (err) {
    logger.error('Trigger extraction error', { invoiceId, err });
    return res.status(500).json({ success: false, error: 'Failed to trigger extraction' });
  }
});

// POST /api/extraction/test
// Test extraction on uploaded text/image without saving to DB
extractionRouter.post('/test', async (req: Request, res: Response) => {
  const { text, image_base64, mime_type, ai_provider } = req.body as {
    text?: string;
    image_base64?: string;
    mime_type?: string;
    ai_provider?: AIProvider;
  };

  if (!text && !image_base64) {
    return res.status(400).json({ success: false, error: 'Provide text or image_base64' });
  }

  const provider: AIProvider = ai_provider ?? (process.env.DEFAULT_AI_PROVIDER as AIProvider) ?? 'openai';

  try {
    const customFields = await getActiveExtractionFields();
    const extractor = getProvider(provider);
    const result = await extractor.extract({
      text: text ?? '',
      imageBase64: image_base64,
      mimeType: mime_type,
      customFields,
    });
    return res.json({ success: true, data: result, provider });
  } catch (err) {
    logger.error('Test extraction error', err);
    return res.status(500).json({ success: false, error: 'Extraction failed' });
  }
});

// GET /api/extraction/:invoiceId/status
extractionRouter.get('/:invoiceId/status', async (req: Request, res: Response) => {
  try {
    const invoice = await db('invoices')
      .where({ invoice_id: req.params.invoiceId })
      .select('extraction_last_job_id')
      .first();
    const trackedJobId = invoice?.extraction_last_job_id ?? `extract-${req.params.invoiceId}`;
    const job = await extractionQueue.getJob(trackedJobId);
    logger.info('Extraction status requested', { invoiceId: req.params.invoiceId, trackedJobId, found: !!job });
    if (!job) {
      return res.json({ success: true, data: { status: 'not_found', jobId: trackedJobId } });
    }
    const state = await job.getState();
    logger.info('Extraction status resolved', {
      invoiceId: req.params.invoiceId,
      trackedJobId,
      state,
      attempts: job.attemptsMade,
    });
    return res.json({
      success: true,
      data: { status: state, progress: job.progress, attempts: job.attemptsMade, jobId: trackedJobId },
    });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to get job status' });
  }
});

// GET /api/extraction/providers
// List available providers and their configuration status
extractionRouter.get('/providers', async (_req: Request, res: Response) => {
  const [openaiModels, anthropicModels, geminiModels] = await Promise.all([
    getProviderModels('openai'),
    getProviderModels('anthropic'),
    getProviderModels('gemini'),
  ]);
  res.json({
    success: true,
    data: {
      available: [
        {
          id: 'openai',
          name: 'OpenAI',
          configured: !!process.env.OPENAI_API_KEY,
          default_model: process.env.OPENAI_MODEL ?? 'gpt-5.2',
          models: openaiModels,
        },
        {
          id: 'anthropic',
          name: 'Anthropic Claude',
          configured: !!process.env.ANTHROPIC_API_KEY,
          default_model: anthropicModels[0],
          models: anthropicModels,
        },
        {
          id: 'gemini',
          name: 'Google Gemini',
          configured: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
          default_model: geminiModels[0],
          models: geminiModels,
        },
      ],
      default: process.env.DEFAULT_AI_PROVIDER ?? 'openai',
    },
  });
});
