import crypto from 'crypto';
import { WorkspaceModel } from '../workspace/workspace.model';
import { env } from '../../shared/config/env.config';
import { logger } from '../../shared/utils/logger';

/**
 * Outbound webhook delivery for workspace automation.
 *
 * The Settings page has always advertised a webhook endpoint, but nothing was
 * ever sent to it. Dispatch is best-effort: a slow or broken receiver must
 * never delay or fail a publish.
 */
export class WorkspaceWebhookService {
  private signingSecret = crypto
    .createHash('sha256')
    .update(`socialflow-webhook:${env.JWT_SECRET}`)
    .digest('hex');

  async dispatch(workspaceId: string | undefined, event: string, data: Record<string, unknown>): Promise<void> {
    if (!workspaceId) return;

    try {
      const workspace = await WorkspaceModel.findById(workspaceId).select('settings.webhookUrl').lean();
      const url = workspace?.settings?.webhookUrl;
      if (!url) return;

      const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data
      });
      const signature = crypto.createHmac('sha256', this.signingSecret).update(body).digest('hex');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'user-agent': 'SocialFlow-Webhooks/1.0',
            'x-socialflow-signature': `sha256=${signature}`
          },
          body,
          signal: controller.signal
        });
        if (!response.ok) {
          logger.warn(`[Webhook] ${event} delivery to workspace ${workspaceId} returned ${response.status}`);
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (error: any) {
      logger.warn(`[Webhook] ${event} delivery failed for workspace ${workspaceId}: ${error?.message || error}`);
    }
  }
}

export default WorkspaceWebhookService;
