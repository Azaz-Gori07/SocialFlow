import crypto from 'crypto';
import { env } from '../../../shared/config/env.config';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Key policy: in production ENCRYPTION_KEY must be set; in development it is
 * derived from JWT_SECRET (see env.config.ts). The key is always exactly 32 bytes.
 */
const ENCRYPTION_KEY: Buffer = crypto.createHash('sha256').update(env.encryptionKey).digest();

export class EncryptionAdapter {
  /** Encrypts plain text → "iv_hex:ciphertext_hex". */
  static encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  /** Decrypts "iv_hex:ciphertext_hex" → plain text. */
  static decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted format. Expected "iv:ciphertext"');
    }
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  }
}
export default EncryptionAdapter;
