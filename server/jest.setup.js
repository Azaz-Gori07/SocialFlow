const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongod;

beforeAll(async () => {
  if (!mongod) {
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = await mongod.getUri();
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: 'socialflow-test',
      serverSelectionTimeoutMS: 10000,
      retryWrites: false
    });
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
});
