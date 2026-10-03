/**
 * QA-only: inserts a connected social account directly so the scheduling →
 * delivery → publisher path can be exercised without a live provider OAuth
 * round-trip. NEVER used by the running app.
 *
 * Run: npx ts-node scripts/qaAccount.ts <userId> <platform>
 */
import mongoose from 'mongoose';
import { db } from '../src/database/db';

(async () => {
  const [userId, platform] = process.argv.slice(2);
  await mongoose.connect(process.env.MONGO_URI as string);

  const existing = await db.socialAccounts.findOne({ userId, platform } as any);
  if (existing) {
    console.log(JSON.stringify({ accountId: existing._id.toString(), existed: true }));
    await mongoose.disconnect();
    return;
  }

  const acc = await db.socialAccounts.create({
    userId,
    platform,
    providerAccountId: `qa_${platform}_1`,
    username: `qa_${platform}`,
    displayName: `QA ${platform}`,
    encryptedAccessToken: 'iv_hex:ciphertext_hex',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);

  console.log(JSON.stringify({ accountId: acc._id.toString(), platform, existed: false }));
  await mongoose.disconnect();
})().catch((e) => {
  console.error('failed:', e.message);
  process.exit(1);
});