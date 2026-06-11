import crypto from 'crypto';
import { env } from '../../../shared/config/env.config';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16

// Safe, production-grade key derivation yielding exactly 32 bytes
const ENCRYPTION_KEY: Buffer = env.ENCRYPTION_KEY
  ? crypto.createHash('sha256').update(env.ENCRYPTION_KEY).digest()
  : crypto.createHash('sha256').update(env.JWT_SECRET).digest();

export class EncryptionAdapter {
  /**
   * Encrypts plain text using AES-256-CBC
   * @param text Original unencrypted string
   * @returns String formatted as "iv_hex:ciphertext_hex"
   */
  static encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypts encrypted string
   * @param encryptedText Text formatted as "iv_hex:ciphertext_hex"
   * @returns Decrypted original string
   */
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
