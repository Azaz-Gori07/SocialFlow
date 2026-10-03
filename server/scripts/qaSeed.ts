/**
 * QA-only seed. Creates an activated user directly so physical end-to-end testing
 * does not depend on receiving a real OTP email. NEVER used by the running app.
 *
 * Run: npx ts-node scripts/qaSeed.ts <email> <password>
 */
import mongoose from 'mongoose';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../src/database/db';

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('usage: ts-node scripts/qaSeed.ts <email> <password>');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI as string);

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const existing = await db.users.findOne({ email } as any);
  if (existing) {
    await db.users.updateOne(
      { email } as any,
      { $set: { passwordHash, emailVerified: true } } as any
    );
    console.log(JSON.stringify({ email, userId: existing._id.toString(), activated: true, existed: true }));
    await mongoose.disconnect();
    return;
  }

  const user = await db.users.create({
    fullName: 'QA Tester',
    email,
    passwordHash,
    emailVerified: true,
    provider: 'local',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);

  const workspace = await db.workspaces.create({
    name: "QA Tester's Workspace",
    ownerId: user._id.toString(),
    role: 'owner',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);

  await db.users.updateOne({ _id: user._id } as any, { $set: { workspaceId: workspace._id.toString() } } as any);

  console.log(JSON.stringify({ email, userId: user._id.toString(), workspaceId: workspace._id.toString(), activated: true, existed: false }));
  await mongoose.disconnect();
})().catch((err) => {
  console.error('seed failed:', err.message);
  process.exit(1);
});