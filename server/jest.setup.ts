import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod: MongoMemoryServer | null = null;

export default async function setup() {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = await mongod.getUri();
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: 'socialflow-test',
    serverSelectionTimeoutMS: 10000,
    retryWrites: false
  });
}

export async function teardown() {
  await mongoose.disconnect();
  await mongod?.stop();
}
