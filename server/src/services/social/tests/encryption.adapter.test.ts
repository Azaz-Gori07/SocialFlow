import crypto from 'crypto';
import { EncryptionAdapter } from '../adapters/encryption.adapter';
import { env } from '../../../shared/config/env.config';

describe('EncryptionAdapter Unit Tests', () => {
  const plainText = 'secret_token_12345!@#';

  it('should successfully encrypt plain text', () => {
    const encrypted = EncryptionAdapter.encrypt(plainText);
    expect(encrypted).toBeDefined();
    expect(encrypted).toContain(':');
    expect(encrypted).not.toBe(plainText);

    const parts = encrypted.split(':');
    expect(parts.length).toBe(4);
    expect(parts[0]).toBe('gcm');
    // 12-byte IV, 16-byte auth tag, then the ciphertext — all hex.
    expect(parts[1]).toMatch(/^[0-9a-f]{24}$/i);
    expect(parts[2]).toMatch(/^[0-9a-f]{32}$/i);
    expect(parts[3]).toMatch(/^[0-9a-f]+$/i);
  });

  it('should successfully decrypt encrypted text back to original', () => {
    const encrypted = EncryptionAdapter.encrypt(plainText);
    const decrypted = EncryptionAdapter.decrypt(encrypted);
    expect(decrypted).toBe(plainText);
  });

  it('should reject tampered GCM ciphertext instead of returning garbage', () => {
    const encrypted = EncryptionAdapter.encrypt(plainText);
    const parts = encrypted.split(':');
    const lastChar = parts[3].slice(-1);
    const flipped = lastChar === '0' ? '1' : '0';
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3].slice(0, -1)}${flipped}`;
    expect(() => EncryptionAdapter.decrypt(tampered)).toThrow();
  });

  it('should still decrypt legacy CBC rows written before the GCM upgrade', () => {
    const key = crypto.createHash('sha256').update(env.encryptionKey).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const legacy = `${iv.toString('hex')}:${ciphertext.toString('hex')}`;

    expect(EncryptionAdapter.decrypt(legacy)).toBe(plainText);
  });

  it('should throw error when decrypting invalid format', () => {
    expect(() => {
      EncryptionAdapter.decrypt('invalidformatwithoutcolon');
    }).toThrow('Invalid encrypted format');
  });

  it('should throw error when decrypting invalid ciphertext hex', () => {
    expect(() => {
      EncryptionAdapter.decrypt('1234567890abcdef1234567890abcdef:nothex');
    }).toThrow();
  });
});
