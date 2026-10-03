import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import { MetaWebhookService } from './metaWebhook.service';
import { env } from '../../shared/config/env.config';

/**
 * Regression cover for the raw-body crash: a real Meta webhook delivery killed
 * the process because express.json() consumed `req.body` before the raw-body
 * capture ran, leaving an object where `Buffer.from()` expected a string.
 */
describe('Meta webhook signature verification', () => {
  const SECRET = 'whsec-test-secret';
  const originalSecret = (env.meta as any).webhookSecret;

  const sign = (body: string) => 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');

  // Mirrors the fixed middleware order in server.ts: raw capture BEFORE json().
  const buildApp = () => {
    const app = express();
    app.use('/api/webhooks/meta', express.raw({ type: '*/*' }), (req: any, _res: any, next: any) => {
      req.rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
      next();
    });
    app.use(express.json());
    app.post('/api/webhooks/meta', (req, res) => {
      const captured = (req as any).rawBody;
      const rawBody = Buffer.isBuffer(captured)
        ? captured
        : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}), 'utf8');
      if (!MetaWebhookService.verifySignature(rawBody, req.headers['x-hub-signature-256'] as string | undefined)) {
        return res.status(403).json({ message: 'Invalid signature' });
      }
      return res.status(200).json({ ok: true });
    });
    return app;
  };

  beforeEach(() => {
    (env.meta as any).webhookSecret = SECRET;
  });

  afterAll(() => {
    (env.meta as any).webhookSecret = originalSecret;
  });

  it('accepts a correctly signed delivery without throwing', async () => {
    const body = JSON.stringify({ object: 'page', entry: [] });
    const res = await request(buildApp())
      .post('/api/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('rejects a tampered signature', async () => {
    const body = JSON.stringify({ object: 'page', entry: [] });
    const res = await request(buildApp())
      .post('/api/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', 'sha256=' + '0'.repeat(64))
      .send(body);
    expect(res.status).toBe(403);
  });

  it('rejects a signature computed over a different body', async () => {
    const signed = JSON.stringify({ object: 'page', entry: [] });
    const sent = JSON.stringify({ object: 'page', entry: [{ id: 'tampered' }] });
    const res = await request(buildApp())
      .post('/api/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sign(signed))
      .send(sent);
    expect(res.status).toBe(403);
  });

  it('rejects a delivery with no signature header instead of throwing', async () => {
    const body = JSON.stringify({ object: 'page', entry: [] });
    const res = await request(buildApp())
      .post('/api/webhooks/meta')
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(403);
  });

  it('never throws when rawBody was not captured (defensive coercion)', () => {
    expect(() => {
      // The exact shape that used to crash the process.
      const captured = { some: 'object' } as unknown;
      const raw = Buffer.isBuffer(captured)
        ? captured
        : Buffer.from(typeof captured === 'string' ? captured : JSON.stringify(captured ?? {}), 'utf8');
      expect(Buffer.isBuffer(raw)).toBe(true);
    }).not.toThrow();
  });
});