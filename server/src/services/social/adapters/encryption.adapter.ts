import crypto from 'crypto';
import { env } from '../../../shared/config/env.config';

const ALGORITHM = 'aes-256-gcm';
const LEGACY_ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 12;
const LEGACY_IV_LENGTH = 16;

/**
 * Key policy: in production ENCRYPTION_KEY must be set; in development it is
 * derived from JWT_SECRET (see env.config.ts). The key is always exactly 32 bytes.
 */
const ENCRYPTION_KEY: Buffer = crypto.createHash('sha256').update(env.encryptionKey).digest();

export class EncryptionAdapter {
  /**
   * Encrypts plain text → "gcm:iv_hex:tag_hex:ciphertext_hex".
   * AES-256-GCM authenticates the ciphertext, so a tampered token fails to
   * decrypt instead of silently producing garbage (the old CBC format had no
   * integrity check even though the UI advertised GCM).
   */
  static encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `gcm:${iv.toString('hex')}:${tag}:${encrypted}`;
  }

  /**
   * Decrypts the current GCM format. Also accepts the legacy
   * "iv_hex:ciphertext_hex" CBC rows written before the upgrade so existing
   * social connections keep working; they are re-encrypted on their next save.
   */
  static decrypt(encryptedText: string): string {
    if (encryptedText.startsWith('gcm:')) {
      const parts = encryptedText.split(':');
      if (parts.length !== 4) {
        throw new Error('Invalid GCM payload');
      }
      const iv = Buffer.from(parts[1], 'hex');
      const tag = Buffer.from(parts[2], 'hex');
      const encrypted = Buffer.from(parts[3], 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('utf8');
    }

    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted format. Expected "iv:ciphertext"');
    }
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  }
}
export default EncryptionAdapter;
