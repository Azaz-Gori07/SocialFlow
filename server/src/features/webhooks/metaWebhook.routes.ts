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
  const rawBody = Buffer.from((req as any).rawBody ?? '', 'utf8');
  const signature = req.headers['x-hub-signature-256'] as string | undefined;

  if (!MetaWebhookService.verifySignature(rawBody, signature)) {
    return res.status(403).json({ message: 'Invalid signature' });
  }

  try {
    const result = await MetaWebhookService.processPayload(req.body);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('Meta webhook processing error:', error);
    return res.status(500).json({ message: 'Webhook processing failed' });
  }
});

export default router;
