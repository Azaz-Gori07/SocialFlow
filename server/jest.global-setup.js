const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

module.exports = async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = await mongod.getUri();
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: 'socialflow-test',
    serverSelectionTimeoutMS: 10000,
    retryWrites: false
  });
  global.__MONGOD__ = mongod;
};
