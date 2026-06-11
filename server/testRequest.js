const fetch = require('node-fetch');
require('dotenv').config({ path: __dirname + '/.env' });
console.log('Loaded JWT_SECRET:', process.env.JWT_SECRET);
const jwt = require('jsonwebtoken');
// Generate a valid auth token using the secret from .env
const token = jwt.sign({ id: 'testuser', email: 'test@example.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });
const urlGenerate = `http://localhost:${process.env.PORT || 5000}/api/ai/generate-post`;
const urlRegenerate = `http://localhost:${process.env.PORT || 5000}/api/ai/regenerate`;
const urlReply = `http://localhost:${process.env.PORT || 5000}/api/ai/reply-suggestion`;
const body = { prompt: 'Test generate post', platform: 'twitter' };
// Test generate-post
fetch(urlGenerate, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body)
})
  .then(res => res.json())
  .then(data => {
    console.log('Generate Response:', JSON.stringify(data, null, 2));
    // Regenerate using the returned post id
    const regenBody = { postId: data.id, platform: 'twitter' };
    return fetch(urlRegenerate, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(regenBody)
    })
      .then(r => r.json())
      .then(rdata => {
        console.log('Regenerate Response:', JSON.stringify(rdata, null, 2));
        // Reply suggestion using same post id
        const replyBody = { postId: data.id, platform: 'twitter' };
        return fetch(urlReply, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(replyBody)
        })
        .then(r2 => r2.json())
        .then(r2data => console.log('Reply Suggestion Response:', JSON.stringify(r2data, null, 2)));
      });
  })
  .catch(err => console.error('Error during tests:', err));
