"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncryptionAdapter = void 0;
const crypto_1 = __importDefault(require("crypto"));
const env_config_1 = require("../../../shared/config/env.config");
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16
// Safe, production-grade key derivation yielding exactly 32 bytes
const ENCRYPTION_KEY = env_config_1.env.ENCRYPTION_KEY
    ? crypto_1.default.createHash('sha256').update(env_config_1.env.ENCRYPTION_KEY).digest()
    : crypto_1.default.createHash('sha256').update(env_config_1.env.JWT_SECRET).digest();
class EncryptionAdapter {
    /**
     * Encrypts plain text using AES-256-CBC
     * @param text Original unencrypted string
     * @returns String formatted as "iv_hex:ciphertext_hex"
     */
    static encrypt(text) {
        const iv = crypto_1.default.randomBytes(IV_LENGTH);
        const cipher = crypto_1.default.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `${iv.toString('hex')}:${encrypted}`;
    }
    /**
     * Decrypts encrypted string
     * @param encryptedText Text formatted as "iv_hex:ciphertext_hex"
     * @returns Decrypted original string
     */
    static decrypt(encryptedText) {
        const parts = encryptedText.split(':');
        if (parts.length !== 2) {
            throw new Error('Invalid encrypted format. Expected "iv:ciphertext"');
        }
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = Buffer.from(parts[1], 'hex');
        const decipher = crypto_1.default.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString('utf8');
    }
}
exports.EncryptionAdapter = EncryptionAdapter;
exports.default = EncryptionAdapter;
