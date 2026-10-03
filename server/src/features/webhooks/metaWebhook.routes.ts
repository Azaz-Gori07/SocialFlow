import { Router, Response } from 'express';
import { Request } from 'express';
import { MetaWebhookService } from './metaWebhook.service';

const router = Router();

// GET /api/webhooks/meta - subscription verification (hub.challenge)
router.get('/meta', async (req: Request, res: Response) => {
  const challenge = MetaWebhookService.verifyChallenge(req.query as Record<string, any>);
  if (challenge) {
    res.set('Content-Type', 'text/plain');
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ message: 'Verification failed' });
});

// POST /api/webhooks/meta - signed event delivery (raw body required for HMAC)
router.post('/meta', async (req: Request, res: Response) => {
  // `rawBody` is captured before the JSON parser runs. If the parser got there
  // first it is an object, which cannot be verified — coerce rather than throw,
  // so a malformed delivery can never take the process down.
  const captured = (req as any).rawBody;
  const rawBody = Buffer.isBuffer(captured)
    ? captured
    : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}), 'utf8');
  const signature = req.headers['x-hub-signature-256'] as string | undefined;

  if (!MetaWebhookService.verifySignature(rawBody, signature)) {
    return res.status(403).json({ message: 'Invalid signature' });
  }

  try {
    // express.raw() runs before express.json() on this path and marks the body
    // as parsed, so req.body is still the raw Buffer — parse from rawBody.
    const payload = Buffer.isBuffer(rawBody) ? JSON.parse(rawBody.toString('utf8')) : req.body;
    const result = await MetaWebhookService.processPayload(payload);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('Meta webhook processing error:', error);
    return res.status(500).json({ message: 'Webhook processing failed' });
  }
});

export default router;
