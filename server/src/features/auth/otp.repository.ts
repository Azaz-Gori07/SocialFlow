import OtpModel, { IOtp, OtpPurpose } from './otp.model';

export class OtpRepository {
  async create(userId: string, codeHash: string, purpose: OtpPurpose, expiresAt: Date): Promise<IOtp> {
    const otp = new OtpModel({ userId, codeHash, purpose, expiresAt });
    return otp.save();
  }

  async findLatestByUserId(userId: string, purpose: OtpPurpose): Promise<IOtp | null> {
    return OtpModel.findOne({ userId, purpose, expiresAt: { $gt: new Date() }, used: false })
      .sort({ createdAt: -1 })
      .exec();
  }

  async markUsed(id: string): Promise<void> {
    await OtpModel.findByIdAndUpdate(id, { $set: { used: true } }).exec();
  }

  async incrementAttempts(id: string): Promise<void> {
    await OtpModel.findByIdAndUpdate(id, { $inc: { attempts: 1 } }).exec();
  }

  async invalidateAllForUser(userId: string, purpose: OtpPurpose): Promise<void> {
    await OtpModel.updateMany(
      { userId, purpose, used: false },
      { $set: { used: true } }
    ).exec();
  }
}

export default OtpRepository;
