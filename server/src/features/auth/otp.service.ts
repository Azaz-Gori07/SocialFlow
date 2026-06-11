import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { OtpRepository } from './otp.repository';
import { OtpPurpose } from './otp.model';
import { env } from '../../shared/config/env.config';

const OTP_LENGTH = 8;
const MAX_ATTEMPTS = 5;
const EXPIRY_MINUTES = env.OTP_EXPIRY_MINUTES || 10;

export class OtpService {
  constructor(private otpRepository: OtpRepository) {}

  async generateAndSendOtp(userId: string, email: string, purpose: OtpPurpose): Promise<void> {
    await this.otpRepository.invalidateAllForUser(userId, purpose);

    const code = this.generateCode();
    const salt = await bcrypt.genSalt(10);
    const codeHash = await bcrypt.hash(code, salt);

    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);
    await this.otpRepository.create(userId, codeHash, purpose, expiresAt);

    await this.sendOtp(email, code, purpose);
  }

  async verifyOtp(userId: string, code: string, purpose: OtpPurpose): Promise<boolean> {
    const otp = await this.otpRepository.findLatestByUserId(userId, purpose);
    if (!otp) return false;
    if (otp.attempts >= MAX_ATTEMPTS) return false;
    if (new Date() > otp.expiresAt) return false;
    if (otp.used) return false;

    const isValid = await bcrypt.compare(code, otp.codeHash);
    if (!isValid) {
      await this.otpRepository.incrementAttempts(otp._id.toString());
      return false;
    }

    await this.otpRepository.markUsed(otp._id.toString());
    return true;
  }

  private generateCode(): string {
    const bytes = crypto.randomBytes(4);
    const num = bytes.readUInt32BE(0) % 100000000;
    return num.toString().padStart(OTP_LENGTH, '0');
  }

  private async sendOtp(email: string, code: string, purpose: OtpPurpose): Promise<void> {
    const subject = purpose === 'account_activation'
      ? 'Activate your SocialFlow account'
      : 'Your SocialFlow login verification code';

    const smtpHost = env.OTP_EMAIL_HOST || 'smtp.gmail.com';
    const smtpPort = env.OTP_EMAIL_PORT || 587;
    const smtpUser = env.EMAIL_USER || env.OTP_EMAIL_USER;
    const smtpPass = env.EMAIL_PASS || env.OTP_EMAIL_PASS;

    if (smtpUser && smtpPass) {
      try {
        const nodemailer = await import('nodemailer');
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
      } catch (err: any) {
        console.error(`[OtpService] SMTP delivery failed: ${err.message}`);
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[OtpService] OTP for ${email} (${purpose}) code: ${code}`);
    }
  }
}

export default OtpService;
