import crypto from 'crypto';
import { logger } from '../../shared/utils/logger';

/**
 * Media copyright detection.
 *
 * Default mode: URL fingerprint (host + path). Catches the same image URL
 * being reused, but NOT re-uploads of the same image to different URLs.
 *
 * Upgrade path: install `sharp` (npm install sharp in server/). The service
 * auto-detects it and switches to perceptual dHash (64-bit), which catches
 * near-duplicate images across different URLs.
 */
export class ImageHashService {
  private sharpModule: any = null;
  private sharpChecked = false;

  private trySharp(): any {
    if (this.sharpChecked) return this.sharpModule;
    this.sharpChecked = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.sharpModule = require('sharp');
      logger.info('[image-hash] sharp is available — using perceptual dHash');
    } catch {
      logger.info('[image-hash] sharp not installed — falling back to URL fingerprint');
      this.sharpModule = null;
    }
    return this.sharpModule;
  }

  /**
   * Computes one fingerprint per media item.
   * If sharp is available, uses dHash (64-bit hex); otherwise URL sha256.
   */
  async computeMediaHashes(
    media: Array<{ url: string; kind: string }>,
    userId: string
  ): Promise<string[]> {
    const hashes: string[] = [];
    for (const m of media) {
      const h = await this.hashOne(m, userId);
      if (h) hashes.push(h);
    }
    return hashes;
  }

  private async hashOne(media: { url: string; kind: string }, userId: string): Promise<string | null> {
    const sharp = this.trySharp();

    if (sharp && media.kind === 'image') {
      try {
        const resp = await fetch(media.url, {
          headers: { 'user-agent': 'SocialFlowBot/1.0 (+copyright-check)' },
          signal: AbortSignal.timeout(8000),
        });
        if (!resp.ok) return this.urlFingerprint(media.url);
        const buffer = Buffer.from(await resp.arrayBuffer());

        // Resize 9x8 grayscale → 64 horizontal-gradient bits
        const raw: Buffer = await sharp(buffer)
          .resize(9, 8, { fit: 'fill' })
          .grayscale()
          .raw()
          .toBuffer();

        let bits = '';
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            bits += raw[y * 9 + x] > raw[y * 9 + x + 1] ? '1' : '0';
          }
        }
        let hex = '';
        for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
        return `dhash:${hex}`;
      } catch (err) {
        logger.warn('[image-hash] dHash failed, using URL fingerprint', {
          userId, error: String(err).slice(0, 200),
        });
      }
    }

    return this.urlFingerprint(media.url);
  }

  /**
   * URL fingerprint: normalize scheme/host case, strip query string, hash.
   * Catches identical URL reuse. Does NOT catch image re-upload to a new URL.
   */
  private urlFingerprint(url: string): string {
    try {
      const u = new URL(url);
      const normalized = `${u.hostname.toLowerCase()}${u.pathname}`;
      return `url:${crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32)}`;
    } catch {
      return `raw:${crypto.createHash('sha256').update(url).digest('hex').slice(0, 32)}`;
    }
  }

  /**
   * Hamming distance for dHash comparison (0 = identical, 64 = max different).
   * For url: hashes, only exact match counts (returns 0 or 64).
   */
  hammingDistance(hash1: string, hash2: string): number {
    if (!hash1 || !hash2) return 64;
    if (hash1.startsWith('url:') || hash2.startsWith('url:')) {
      return hash1 === hash2 ? 0 : 64;
    }
    const h1 = hash1.replace('dhash:', '');
    const h2 = hash2.replace('dhash:', '');
    if (h1.length !== h2.length) return 64;
    let dist = 0;
    for (let i = 0; i < h1.length; i++) {
      let xor = parseInt(h1[i], 16) ^ parseInt(h2[i], 16);
      while (xor) { dist += xor & 1; xor >>= 1; }
    }
    return dist;
  }

  /**
   * Returns true if media matches any blocked hash for this user.
   * dHash: distance <= 10 means visually near-identical.
   * url: requires exact match.
   */
  isBlockedMatch(hash: string, blockedHashes: string[]): boolean {
    for (const b of blockedHashes) {
      if (!b) continue;
      const bothDHash = hash.startsWith('dhash:') && b.startsWith('dhash:');
      if (bothDHash && this.hammingDistance(hash, b) <= 10) return true;
      if (!bothDHash && hash === b) return true;
    }
    return false;
  }
}

export const imageHashService = new ImageHashService();
export default imageHashService;
