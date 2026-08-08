import OAuthConnectionModel, { IOAuthConnection } from './oauthConnection.model';

export class OAuthConnectionRepository {
  async upsert(
    match: { userId: string; platform: string; externalAccountId: string },
    data: Partial<IOAuthConnection>
  ): Promise<IOAuthConnection> {
    const existing = await OAuthConnectionModel.findOne(match as any).exec();
    const now = new Date().toISOString();
    if (existing) {
      const updated = await OAuthConnectionModel.findByIdAndUpdate(
        existing._id,
        { $set: { ...data, updatedAt: now } },
        { new: true }
      ).exec();
      if (!updated) throw new Error('OAuth connection update failed');
      return updated;
    }
    return OAuthConnectionModel.create({ ...match, ...data, createdAt: now, updatedAt: now } as any);
  }

  async findById(id: string): Promise<IOAuthConnection | null> {
    return OAuthConnectionModel.findById(id).exec();
  }

  async findByIdAndUser(id: string, userId: string): Promise<IOAuthConnection | null> {
    return OAuthConnectionModel.findOne({ _id: id, userId } as any).exec();
  }

  async findByUserIdPlatform(userId: string, platform: string): Promise<IOAuthConnection[]> {
    return OAuthConnectionModel.find({ userId, platform } as any).exec();
  }

  async findByUserId(userId: string): Promise<IOAuthConnection[]> {
    return OAuthConnectionModel.find({ userId } as any).exec();
  }

  async setTokens(
    id: string,
    tokens: { encryptedAccessToken?: string; encryptedRefreshToken?: string; accessTokenExpiresAt?: string }
  ): Promise<IOAuthConnection | null> {
    return OAuthConnectionModel.findByIdAndUpdate(
      id,
      { $set: { ...tokens, updatedAt: new Date().toISOString() } },
      { new: true }
    ).exec();
  }

  async setStatus(id: string, status: IOAuthConnection['status'], lastError?: string): Promise<void> {
    await OAuthConnectionModel.findByIdAndUpdate(id, {
      $set: { status, lastError: lastError ?? null, updatedAt: new Date().toISOString() },
    }).exec();
  }

  async setLastValidated(id: string): Promise<void> {
    await OAuthConnectionModel.findByIdAndUpdate(id, {
      $set: { lastValidatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    }).exec();
  }

  async delete(id: string): Promise<boolean> {
    const result = await OAuthConnectionModel.findByIdAndDelete(id).exec();
    return !!result;
  }
}
export default OAuthConnectionRepository;
