const mongoose = require('mongoose');
const { env } = require('./dist/shared/config/env.config');

const MONGO_URI = env.MONGO_URI || 'mongodb://localhost:27017/socialflow_test';

console.log('Connecting to:', MONGO_URI);

mongoose.connect(MONGO_URI)
.then(() => {
  console.log('Connected successfully!');
  mongoose.disconnect();
})
.catch(err => {
  console.error('Connection failed:', err.message);
});