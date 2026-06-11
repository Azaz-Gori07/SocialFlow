// P0 Route Verification Script (CommonJS, no template-literal regex)
const path = require('path');
const fs = require('fs');

console.log('\n=== P0 ROUTE VERIFICATION ===\n');

const serverContent = fs.readFileSync(path.join(__dirname, '../src/server.ts'), 'utf8');

const expectedRoutes = [
  { method: 'get', path: '/api/dashboard/overview' },
  { method: 'get', path: '/api/dashboard/growth' },
  { method: 'get', path: '/api/dashboard/platforms' },
  { method: 'post', path: '/api/ai/generate-post' },
  { method: 'post', path: '/api/ai/regenerate' },
  { method: 'post', path: '/api/ai/reply-suggestion' },
  { method: 'post', path: '/api/repurpose/youtube' },
  { method: 'post', path: '/api/repurpose/blog' },
  { method: 'get', path: '/api/insights' },
  { method: 'post', path: '/api/insights/generate' },
  { method: 'post', path: '/api/social/connect-direct' },
  { method: 'put', path: '/api/workspace/role' },
];

let pass = 0;
let fail = 0;

console.log('--- P0.1-P0.4: Backend Route Registration ---\n');
for (const route of expectedRoutes) {
  // Escape special regex characters in path
  const escaped = route.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('app\\.' + route.method + '\\s*\\(\\s*[\'"]' + escaped + '[\'"]');
  if (regex.test(serverContent)) {
    console.log('  PASS  ' + route.method.toUpperCase().padEnd(5) + ' ' + route.path);
    pass++;
  } else {
    console.log('  FAIL  ' + route.method.toUpperCase().padEnd(5) + ' ' + route.path);
    fail++;
  }
}

console.log('\n--- P0.3: Comment Router Mount ---\n');
const commentRouterImported = serverContent.includes("import commentRouter from './features/comment/comment.routes'");
const commentRouterMounted = serverContent.includes("app.use('/api/comments', commentRouter)");
console.log('  ' + (commentRouterImported ? 'PASS' : 'FAIL') + '  commentRouter imported');
console.log('  ' + (commentRouterMounted ? 'PASS' : 'FAIL') + '  /api/comments mounted');
if (commentRouterImported) pass++; else fail++;
if (commentRouterMounted) pass++; else fail++;

console.log('\n--- P0.4: Frontend URL Alignment ---\n');
const clientContent = fs.readFileSync(path.join(__dirname, '../../client/src/services/api.ts'), 'utf8');
const frontendUrls = [
  'social/accounts',
  'social/connect-direct',
  'dashboard/overview',
  'dashboard/growth',
  'dashboard/platforms',
  'posts/list',
  '/comments/reply',
  '/comments/resolve/',
  '/comments/assign/',
  'workspace/list',
  'workspace/role',
  'ai/generate-post',
  '/insights',
];
for (const url of frontendUrls) {
  if (clientContent.includes(url)) {
    console.log('  PASS  ' + url);
    pass++;
  } else {
    console.log('  FAIL  ' + url);
    fail++;
  }
}

console.log('\n--- P0.5: Refresh Token Response Parsing ---\n');
const checks = [
  { name: 'Response envelope unwrapping', pattern: "'data' in json" },
  { name: 'Token data extraction from refresh', pattern: 'tokenData = refreshJson.data' },
  { name: 'Token data access token usage', pattern: 'tokenData.accessToken' },
];
for (const check of checks) {
  if (clientContent.includes(check.pattern)) {
    console.log('  PASS  ' + check.name);
    pass++;
  } else {
    console.log('  FAIL  ' + check.name);
    fail++;
  }
}

console.log('\n--- P0.6: ProviderFactory Production Guard ---\n');
const factoryContent = fs.readFileSync(path.join(__dirname, '../src/services/social/providers/provider.factory.ts'), 'utf8');
const factoryChecks = [
  { name: 'allowMock() method exists', pattern: 'allowMock' },
  { name: 'NODE_ENV check exists', pattern: "NODE_ENV !== 'production'" },
  { name: 'Production error message exists', pattern: 'Cannot use Mock Provider in production' },
];
for (const check of factoryChecks) {
  if (factoryContent.includes(check.pattern)) {
    console.log('  PASS  ' + check.name);
    pass++;
  } else {
    console.log('  FAIL  ' + check.name);
    fail++;
  }
}

console.log('\n=== TOTAL: ' + pass + ' passed, ' + fail + ' failed ===\n');
process.exit(fail > 0 ? 1 : 0);
