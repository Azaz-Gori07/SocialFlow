const fetch = require('node-fetch');
require('dotenv').config({ path: './.env' });
// Rate limit applies to any /api/ endpoint; we can hit a simple public endpoint
// Use an API endpoint that returns 401 without auth; rate limiter should still apply and eventually return 429
// Use the register endpoint which returns 400 for missing fields but still passes through the limiter
const url = `http://localhost:5004/api/test/limit`;
const options = {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test@example.com', password: 'pwd', fullName: 'Test' })
};
let count = 0;
function request() {
  // generate a unique email for each request to avoid duplicate‑user validation errors
  const uniqueOptions = {
    ...options,
    body: JSON.stringify({
      email: `test${Date.now()}_${count}@example.com`,
      password: 'pwd',
      fullName: 'Test'
    })
  };
  return fetch(url, uniqueOptions)
    .then(res => {
      console.log(`Request ${++count}: ${res.status}`);
      return res;
    })
    .catch(err => console.error('Error', err));
}
// fire 105 requests quickly to exceed limit of 100 per 15min
Promise.all(Array.from({ length: 105 }, () => request()))
  .then(() => console.log('Done'));