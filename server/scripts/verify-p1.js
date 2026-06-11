const { execSync } = require('child_process');
const path = require('path');

// Change to the server directory where typescript is installed
process.chdir(path.join(__dirname, '..'));

try {
  console.log('Running TypeScript compilation check in server/...');
  const tscPath = path.join(__dirname, '..', 'node_modules', '.bin', 'tsc');
  execSync(`"${tscPath}" --noEmit`, { stdio: 'inherit' });
  console.log('BUILD_OK');
} catch (err) {
  console.log('BUILD_FAIL');
  process.exit(1);
}