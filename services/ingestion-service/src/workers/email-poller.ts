import Imap from 'imap';
import { simpleParser } from 'mailparser';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { db, logger } from '@ap-bps/shared';
import { enqueueExtraction } from '../queues/extraction-queue';
import type { AIProvider } from '@ap-bps/shared';

const SUPPORTED_MIME = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/tiff',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

const POLL_INTERVAL = Number(process.env.EMAIL_INTAKE_POLL_INTERVAL_MS ?? 120_000);
const STORAGE = path.resolve(process.cwd(), process.env.STORAGE_PATH ?? './uploads');
if (!fs.existsSync(STORAGE)) fs.mkdirSync(STORAGE, { recursive: true });

function isPlaceholder(value?: string): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  return (
    v.length === 0 ||
    v.includes('example.com') ||
    v.includes('your_') ||
    v.includes('changeme') ||
    v.includes('replace')
  );
}

function isEmailIntakeConfigured(): boolean {
  return !(
    isPlaceholder(process.env.EMAIL_INTAKE_HOST) ||
    isPlaceholder(process.env.EMAIL_INTAKE_USER) ||
    isPlaceholder(process.env.EMAIL_INTAKE_PASSWORD)
  );
}

async function processEmail(imapMsg: NodeJS.ReadableStream): Promise<void> {
  const parsed = await simpleParser(imapMsg);

  const attachments = parsed.attachments?.filter(
    (a) => SUPPORTED_MIME.includes(a.contentType),
  ) ?? [];

  if (attachments.length === 0) {
    logger.debug('Email has no supported attachments', { subject: parsed.subject });
    return;
  }

  for (const attachment of attachments) {
    const ext = path.extname(attachment.filename ?? 'file') || '.bin';
    const storagePath = path.join(STORAGE, `${uuidv4()}${ext}`);
    fs.writeFileSync(storagePath, attachment.content);

    const aiProvider: AIProvider = (process.env.DEFAULT_AI_PROVIDER as AIProvider) ?? 'openai';

    const [doc] = await db('documents')
      .insert({
        message_id: parsed.messageId ?? null,
        original_filename: attachment.filename ?? 'invoice',
        mime_type: attachment.contentType,
        storage_path: storagePath,
        file_size_bytes: attachment.size ?? null,
        file_data: attachment.content,
      })
      .returning('*');

    const [invoice] = await db('invoices')
      .insert({
        raw_document_id: doc.document_id,
        source_channel: 'email',
        status: 'received',
        currency: 'USD',
      })
      .returning('*');

    await db('documents').where({ document_id: doc.document_id }).update({ invoice_id: invoice.invoice_id });
    await enqueueExtraction({ invoice_id: invoice.invoice_id, document_id: doc.document_id, ai_provider: aiProvider });

    logger.info('Email invoice ingested', {
      invoice_id: invoice.invoice_id,
      filename: attachment.filename,
      subject: parsed.subject,
    });
  }
}

function createImapConnection(): Imap {
  return new Imap({
    user: process.env.EMAIL_INTAKE_USER!,
    password: process.env.EMAIL_INTAKE_PASSWORD!,
    host: process.env.EMAIL_INTAKE_HOST!,
    port: Number(process.env.EMAIL_INTAKE_PORT ?? 993),
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
  });
}

function pollInbox(): Promise<void> {
  return new Promise((resolve, reject) => {
    const imap = createImapConnection();

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, _box) => {
        if (err) { imap.end(); return reject(err); }

        imap.search(['UNSEEN'], (searchErr, uids) => {
          if (searchErr || !uids?.length) { imap.end(); return resolve(); }

          const fetch = imap.fetch(uids, { bodies: '' });
          const promises: Promise<void>[] = [];

          fetch.on('message', (msg) => {
            promises.push(
              new Promise<void>((res, rej) => {
                msg.on('body', (stream) => {
                  processEmail(stream).then(res).catch(rej);
                });
              }),
            );
          });

          fetch.once('end', async () => {
            await Promise.allSettled(promises);
            // Mark as seen
            imap.setFlags(uids, ['\\Seen'], () => { imap.end(); resolve(); });
          });

          fetch.once('error', (e) => { imap.end(); reject(e); });
        });
      });
    });

    imap.once('error', reject);
    imap.connect();
  });
}

export async function startEmailPoller(): Promise<void> {
  if (!isEmailIntakeConfigured()) {
    logger.info('Email intake not configured or uses placeholder values; skipping email poller');
    return;
  }

  const poll = async () => {
    try {
      await pollInbox();
      logger.debug('Email poll cycle complete');
    } catch (err) {
      logger.error('Email poll error', err);
    }
  };

  // Initial run after 5 seconds, then on interval
  setTimeout(poll, 5_000);
  setInterval(poll, POLL_INTERVAL);
  logger.info(`Email poller started - interval ${POLL_INTERVAL}ms`);
}
