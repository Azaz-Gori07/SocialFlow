import SocialAccountModel, { ISocialAccount } from './social.model';
import mongoose from 'mongoose';

export class SocialRepository {
  async findAccountsByUserId(userId: string): Promise<ISocialAccount[]> {
    return SocialAccountModel.find({ userId } as any).exec();
  }

  async findAccountById(id: string): Promise<ISocialAccount | null> {
    return SocialAccountModel.findById(id).exec();
  }

  async findAccountByPlatformUsername(
    userId: string,
    platform: string,
    username: string
  ): Promise<ISocialAccount | null> {
    return SocialAccountModel.findOne({ userId, platform, username } as any).exec();
  }

  async findAccountByPlatformAndAccountId(
    userId: string,
    platform: string,
    accountId: string
  ): Promise<ISocialAccount | null> {
    return SocialAccountModel.findOne({ userId, platform, accountId } as any).exec();
  }

  async createAccount(accountData: Partial<ISocialAccount>): Promise<ISocialAccount> {
    const account = new SocialAccountModel(accountData);
    return account.save();
  }

  async updateAccount(id: string, accountData: Partial<ISocialAccount>): Promise<ISocialAccount | null> {
    return SocialAccountModel.findByIdAndUpdate(
      id,
      { $set: accountData },
      { new: true }
    ).exec();
  }

  async deleteAccount(id: string): Promise<boolean> {
    const result = await SocialAccountModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  /**
   * Deletes all associated comments and analytics records for an account
   */
  async deleteCascadeData(accountId: string): Promise<void> {
    try {
      const AnalyticsModel = mongoose.models.AnalyticsMetric || mongoose.model('AnalyticsMetric');
      const CommentModel = mongoose.models.Comment || mongoose.model('Comment');

      await AnalyticsModel.deleteMany({ accountId }).exec();
      await CommentModel.deleteMany({ accountId }).exec();
    } catch (error) {
      console.error(`[SocialRepository] Cascade delete failed for account ${accountId}:`, error);
    }
  }
}
export default SocialRepository;
