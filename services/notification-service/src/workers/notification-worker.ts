import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import nodemailer from 'nodemailer';
import { logger } from '@ap-bps/shared';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

interface NotificationJob {
  to: string;
  subject: string;
  body: string;
  type: 'approval_request' | 'invoice_posted' | 'exception_raised';
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.example.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

async function processNotification(job: Job<NotificationJob>): Promise<void> {
  const { to, subject, body } = job.data;

  if (!process.env.SMTP_HOST || process.env.SMTP_HOST === 'smtp.example.com') {
    logger.info('SMTP not configured – notification skipped', { to, subject });
    return;
  }

  const transporter = createTransport();
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'noreply@example.com',
    to,
    subject,
    html: body,
  });

  logger.info('Notification sent', { to, subject });
}

export function startNotificationWorker(): Worker<NotificationJob> {
  const worker = new Worker<NotificationJob>(
    'notifications',
    processNotification,
    { connection, concurrency: 5 },
  );

  worker.on('completed', (job) => logger.info('Notification sent', { jobId: job.id }));
  worker.on('failed', (job, err) =>
    logger.error('Notification failed', { jobId: job?.id, error: err.message }),
  );

  logger.info('Notification worker started');
  return worker;
}
