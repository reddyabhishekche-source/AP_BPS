import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { requireRole } from '../middleware/auth';

export const proxyRouter = Router();

const INGESTION   = process.env.INGESTION_SERVICE_URL   ?? 'http://localhost:3001';
const EXTRACTION  = process.env.EXTRACTION_SERVICE_URL  ?? 'http://localhost:3002';
const VALIDATION  = process.env.VALIDATION_SERVICE_URL  ?? 'http://localhost:3003';
const APPROVAL    = process.env.APPROVAL_SERVICE_URL    ?? 'http://localhost:3004';
const ERP_SYNC    = process.env.ERP_SYNC_SERVICE_URL    ?? 'http://localhost:3005';
const NOTIF       = process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3006';

// Role-gated paths (req.url here has /api stripped by Express)
proxyRouter.use('/erp-sync',      requireRole('admin'));
proxyRouter.use('/notifications', requireRole('admin'));
proxyRouter.use('/admin',         requireRole('admin'));

// Single proxy — routes to the correct service and restores the /api prefix
// that Express stripped before calling this router.
proxyRouter.use(
  createProxyMiddleware({
    changeOrigin: true,
    router: (req) => {
      const p = req.url ?? '';
      if (p.startsWith('/invoices'))       return INGESTION;
      if (p.startsWith('/extraction'))     return EXTRACTION;
      if (p.startsWith('/validation'))     return VALIDATION;
      if (p.startsWith('/approvals'))      return APPROVAL;
      if (p.startsWith('/erp-sync'))       return ERP_SYNC;
      if (p.startsWith('/vendors'))        return ERP_SYNC;
      if (p.startsWith('/purchase-orders')) return ERP_SYNC;
      if (p.startsWith('/gl-codes'))       return ERP_SYNC;
      if (p.startsWith('/notifications'))  return NOTIF;
      if (p.startsWith('/admin'))          return INGESTION;
      return INGESTION;
    },
    // Restore the /api prefix that Express stripped so downstream services
    // receive the full path they expect (e.g. /api/invoices?page=1).
    pathRewrite: (path) => `/api${path}`,
    on: {
      error: (_err, _req, res) => {
        (res as import('http').ServerResponse).writeHead(502, { 'Content-Type': 'application/json' });
        (res as import('http').ServerResponse).end(JSON.stringify({ success: false, error: 'Service unavailable' }));
      },
    },
  }),
);
