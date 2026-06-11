"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OtpService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const env_config_1 = require("../../shared/config/env.config");
const OTP_LENGTH = 8;
const MAX_ATTEMPTS = 5;
const EXPIRY_MINUTES = env_config_1.env.OTP_EXPIRY_MINUTES || 10;
class OtpService {
    otpRepository;
    constructor(otpRepository) {
        this.otpRepository = otpRepository;
    }
    async generateAndSendOtp(userId, email, purpose) {
        await this.otpRepository.invalidateAllForUser(userId, purpose);
        const code = this.generateCode();
        const salt = await bcryptjs_1.default.genSalt(10);
        const codeHash = await bcryptjs_1.default.hash(code, salt);
        const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);
        await this.otpRepository.create(userId, codeHash, purpose, expiresAt);
        await this.sendOtp(email, code, purpose);
    }
    async verifyOtp(userId, code, purpose) {
        const otp = await this.otpRepository.findLatestByUserId(userId, purpose);
        if (!otp)
            return false;
        if (otp.attempts >= MAX_ATTEMPTS)
            return false;
        if (new Date() > otp.expiresAt)
            return false;
        if (otp.used)
            return false;
        const isValid = await bcryptjs_1.default.compare(code, otp.codeHash);
        if (!isValid) {
            await this.otpRepository.incrementAttempts(otp._id.toString());
            return false;
        }
        await this.otpRepository.markUsed(otp._id.toString());
        return true;
    }
    generateCode() {
        const bytes = crypto_1.default.randomBytes(4);
        const num = bytes.readUInt32BE(0) % 100000000;
        return num.toString().padStart(OTP_LENGTH, '0');
    }
    async sendOtp(email, code, purpose) {
        const subject = purpose === 'account_activation'
            ? 'Activate your SocialFlow account'
            : 'Your SocialFlow login verification code';
        const smtpHost = env_config_1.env.OTP_EMAIL_HOST || 'smtp.gmail.com';
        const smtpPort = env_config_1.env.OTP_EMAIL_PORT || 587;
        const smtpUser = env_config_1.env.EMAIL_USER || env_config_1.env.OTP_EMAIL_USER;
        const smtpPass = env_config_1.env.EMAIL_PASS || env_config_1.env.OTP_EMAIL_PASS;
        if (smtpUser && smtpPass) {
            try {
                const nodemailer = await Promise.resolve().then(() => __importStar(require('nodemailer')));
                const transporter = nodemailer.default.createTransport({
                    host: smtpHost,
                    port: smtpPort,
                    secure: smtpPort === 465,
                    auth: { user: smtpUser, pass: smtpPass }
                });
                await transporter.sendMail({
                    from: smtpUser,
                    to: email,
                    subject,
                    text: `Your verification code is: ${code}\n\nThis code expires in ${EXPIRY_MINUTES} minutes.`
                });
                if (process.env.NODE_ENV === 'development') {
                    console.log(`[OtpService] OTP email sent to ${email} via SMTP.`);
                }
                return;
            }
            catch (err) {
                console.error(`[OtpService] SMTP delivery failed: ${err.message}`);
            }
        }
        if (process.env.NODE_ENV === 'development') {
            console.log(`[OtpService] OTP for ${email} (${purpose}) code: ${code}`);
        }
    }
}
exports.OtpService = OtpService;
exports.default = OtpService;
