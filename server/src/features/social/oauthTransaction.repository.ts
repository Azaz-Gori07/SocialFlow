import OAuthTransactionModel, { IOAuthTransaction } from './oauthTransaction.model';

export class OAuthTransactionRepository {
  async create(tx: {
    state: string;
    userId: string;
    platform: string;
    redirectUri: string;
    codeVerifier?: string;
    expiresAt: Date;
  }): Promise<IOAuthTransaction> {
    return OAuthTransactionModel.create(tx as any);
  }

  async findByState(state: string): Promise<IOAuthTransaction | null> {
    return OAuthTransactionModel.findOne({ state } as any).exec();
  }

  /**
   * Atomically consumes the transaction (one-time use).
   * Returns true only if it was pending and became used.
   */
  async consume(state: string): Promise<boolean> {
    const result = await OAuthTransactionModel.updateOne(
      { state, status: 'pending', expiresAt: { $gt: new Date() } } as any,
      { $set: { status: 'used', usedAt: new Date() } }
    ).exec();
    return result.modifiedCount === 1;
  }

  /** Marks all pending transactions that are past expiry. */
  async expireOld(): Promise<void> {
    await OAuthTransactionModel.updateMany(
      { status: 'pending', expiresAt: { $lt: new Date() } } as any,
      { $set: { status: 'expired' } }
    ).exec();
  }
}
export default OAuthTransactionRepository;
