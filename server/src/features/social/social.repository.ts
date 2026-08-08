import SocialAccountModel, { ISocialAccount } from './social.model';
import mongoose from 'mongoose';

export class SocialRepository {
  async findAccountsByUserId(userId: string): Promise<ISocialAccount[]> {
    return SocialAccountModel.find({ userId } as any).exec();
  }

  /** Accounts visible to a workspace member (own + teammate accounts). */
  async findAccountsForWorkspaceMember(userId: string, workspaceId?: string): Promise<ISocialAccount[]> {
    const q: Record<string, unknown> = { userId };
    if (workspaceId) q.workspaceId = workspaceId;
    return SocialAccountModel.find(q as any).exec();
  }

  /** Accounts by ids, ownership-checked. */
  async findAccountsByIds(userId: string, ids: string[]): Promise<ISocialAccount[]> {
    return SocialAccountModel.find({ _id: { $in: ids }, userId } as any).exec();
  }

  async findAccountById(id: string): Promise<ISocialAccount | null> {
    return SocialAccountModel.findById(id).exec();
  }

  async findAccountByProviderAccountId(
    userId: string,
    platform: string,
    providerAccountId: string
  ): Promise<ISocialAccount | null> {
    return SocialAccountModel.findOne({ userId, platform, providerAccountId } as any).exec();
  }

  async createAccount(accountData: Partial<ISocialAccount>): Promise<ISocialAccount> {
    const account = new SocialAccountModel(accountData);
    return account.save();
  }

  async updateAccount(id: string, accountData: Partial<ISocialAccount>): Promise<ISocialAccount | null> {
    return SocialAccountModel.findByIdAndUpdate(
      id,
      { $set: { ...accountData, updatedAt: new Date().toISOString() } },
      { new: true }
    ).exec();
  }

  /** Upsert by the natural key (userId + platform + providerAccountId). */
  async upsertAccount(
    match: { userId: string; platform: string; providerAccountId: string },
    data: Partial<ISocialAccount>
  ): Promise<ISocialAccount> {
    const existing = await SocialAccountModel.findOne(match as any).exec();
    if (existing) {
      const updated = await this.updateAccount(existing._id.toString(), data);
      if (!updated) throw new Error('Social account update failed');
      return updated;
    }
    return this.createAccount({ ...match, ...data } as any);
  }

  async deleteAccount(id: string): Promise<boolean> {
    const result = await SocialAccountModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  async findByConnectionId(connectionId: string): Promise<ISocialAccount[]> {
    return SocialAccountModel.find({ connectionId }).exec();
  }

  async deleteCascadeData(accountId: string): Promise<void> {
    const AnalyticsModel = mongoose.models.AnalyticsMetric || mongoose.model('AnalyticsMetric');
    const CommentModel = mongoose.models.Comment || mongoose.model('Comment');
    await AnalyticsModel.deleteMany({ accountId }).exec();
    await CommentModel.deleteMany({ accountId }).exec();
  }
}
export default SocialRepository;
