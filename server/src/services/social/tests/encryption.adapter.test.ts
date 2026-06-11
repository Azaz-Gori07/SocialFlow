import { EncryptionAdapter } from '../adapters/encryption.adapter';

describe('EncryptionAdapter Unit Tests', () => {
  const plainText = 'secret_token_12345!@#';

  it('should successfully encrypt plain text', () => {
    const encrypted = EncryptionAdapter.encrypt(plainText);
    expect(encrypted).toBeDefined();
    expect(encrypted).toContain(':');
    expect(encrypted).not.toBe(plainText);

    const parts = encrypted.split(':');
    expect(parts.length).toBe(2);
    // IV and ciphertext should be hex strings
    expect(parts[0]).toMatch(/^[0-9a-f]+$/i);
    expect(parts[1]).toMatch(/^[0-9a-f]+$/i);
  });

  it('should successfully decrypt encrypted text back to original', () => {
    const encrypted = EncryptionAdapter.encrypt(plainText);
    const decrypted = EncryptionAdapter.decrypt(encrypted);
    expect(decrypted).toBe(plainText);
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
