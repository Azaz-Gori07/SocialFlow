import { DraftRepository } from './draft.repository';
import { DraftPublisher } from './draft.publisher';
import { DraftPlatform } from './draft.model';

export class DraftScheduler {
  private intervals: NodeJS.Timeout[] = [];
  private readonly POLL_INTERVAL_MS = 30 * 1000;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_BACKOFF_BASE_MS = 60 * 1000;

  constructor(
    private draftRepository: DraftRepository,
    private draftPublisher: DraftPublisher
  ) {}

  private async processReadyDrafts(platform: DraftPlatform): Promise<void> {
    const pending = await this.draftRepository.findReadyByPlatform(platform, 5);
    if (pending.length === 0) return;
    console.log('[DraftScheduler] ' + platform + ': Found ' + pending.length + ' draft(s) ready to publish.');
    for (const draft of pending) {
      try {
        const current = await this.draftRepository.findById(draft._id.toString());
        if (!current || current.status !== 'ready') {
          console.log('[DraftScheduler] ' + platform + ': Skipping draft ' + draft._id + ' (state changed)');
          continue;
        }
        console.log('[DraftScheduler] ' + platform + ': Publishing draft ' + draft._id + '...');
        await this.draftPublisher.publishDraft(current);
      } catch (error: any) {
        console.error('[DraftScheduler] ' + platform + ': Error processing draft ' + draft._id + ': ' + error.message);
      }
    }
  }

  private async processRetryQueue(platform: DraftPlatform): Promise<void> {
    const failed = await this.draftRepository.findFailedForRetry(platform, this.MAX_RETRIES);
    if (failed.length === 0) return;
    console.log('[DraftScheduler] ' + platform + ': Found ' + failed.length + ' failed draft(s) eligible for retry.');
    for (const draft of failed) {
      try {
        if (!draft.lastAttemptAt) continue;
        const elapsed = Date.now() - new Date(draft.lastAttemptAt).getTime();
        const backoffMs = Math.min(draft.retryCount * this.RETRY_BACKOFF_BASE_MS, 180 * 1000);
        if (elapsed < backoffMs) continue;
        console.log('[DraftScheduler] ' + platform + ': Auto-retrying draft ' + draft._id + ' (retry #' + draft.retryCount + ')...');
        await this.draftPublisher.retryDraft(draft._id.toString(), draft.userId);
      } catch (error: any) {
        console.error('[DraftScheduler] ' + platform + ': Retry error for draft ' + draft._id + ': ' + error.message);
      }
    }
  }

  private startPlatformScheduler(platform: DraftPlatform): void {
    console.log('[DraftScheduler] Starting scheduler for ' + platform + '...');
    const interval = setInterval(async () => {
      try {
        await this.processReadyDrafts(platform);
        await this.processRetryQueue(platform);
      } catch (error: any) {
        console.error('[DraftScheduler] ' + platform + ': Polling error: ' + error.message);
      }
    }, this.POLL_INTERVAL_MS);
    this.intervals.push(interval);
  }

  startAll(): void {
    const platforms: DraftPlatform[] = ['instagram', 'facebook', 'linkedin', 'twitter', 'youtube'];
    for (const platform of platforms) {
      this.startPlatformScheduler(platform);
    }
    console.log('[DraftScheduler] All ' + platforms.length + ' platform schedulers started.');
  }

  stopAll(): void {
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];
    console.log('[DraftScheduler] All platform schedulers stopped.');
  }
}

export default DraftScheduler;
