/**
 * Pure diff heuristics: file typing, module detection, deterministic change
 * categorization. No DB, no IO.
 */

export interface FileChange {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed';
  additions: number;
  deletions: number;
  previousFilename?: string | null;
}

export type FileType =
  | 'source'    // .ts .tsx .js .jsx .py .go .java .rs .vue .svelte
  | 'test'      // *.test.* *.spec.* __tests__/
  | 'config'    // *.config.* .env* tsconfig.* package.json docker* .github/
  | 'docs'      // *.md *.txt *.rst docs/
  | 'style'     // *.css *.scss .less .tailwind tailwind*
  | 'asset'     // *.png *.jpg *.svg *.gif *.ico *.woff *.ttf
  | 'lockfile'  // package-lock* yarn.lock pnpm-lock*
  | 'migration' // drizzle/* migrations/*
  | 'other';

const SOURCE_RE = /\.(ts|tsx|js|jsx|py|go|java|rs|vue|svelte|rb|php|kt|swift|c|cpp|h|hpp|cs|dart|zig)$/i;
const TEST_RE = /\.(test|spec)\.(ts|tsx|js|jsx)$|__tests__\//i;
const CONFIG_RE = /\.(config|rc|lock|env|ignore|yml|yaml|toml|ini)$|\.config\./i;
const CONFIG_PATHS = /(^|\/)(docker|Dockerfile|docker-compose|\.env|\.gitignore|turbo\.json|pnpm-workspace)/i;
const CONFIG_FILES = /^(package\.json|tsconfig.*\.json|next\.config.*|eslint.*|prettier.*|babel.*|jest.*|vitest.*|vite.*|webpack.*|rollup.*|postcss.*|tailwind.*)/i;
const DOCS_RE = /\.(md|txt|rst|adoc)$/i;
const DOCS_PATHS = /(^|\/)(docs|doc|documentation|readme)/i;
const STYLE_RE = /\.(css|scss|less|sass|styl)$/i;
const ASSET_RE = /\.(png|jpe?g|gif|ico|svg|webp|woff2?|ttf|eot|mp[34]|wav|ogg|pdf)$/i;
const LOCK_RE = /^(package-lock|yarn\.lock|pnpm-lock|bun\.lockb)/i;
const MIGRATION_PATH = /(drizzle|migrations?)\//i;

const MODULE_DIR_RE = /^(?:src\/|app\/|lib\/|packages\/|components\/|pages\/|views\/)?([^/]+)/;

/** Detect file type from filename + path. */
export function detectFileType(filename: string): FileType {
  if (TEST_RE.test(filename)) return 'test';
  if (MIGRATION_PATH.test(filename)) return 'migration';
  if (LOCK_RE.test(filename)) return 'lockfile';
  if (ASSET_RE.test(filename)) return 'asset';
  if (STYLE_RE.test(filename)) return 'style';
  if (DOCS_RE.test(filename) || DOCS_PATHS.test(filename)) return 'docs';
  if (CONFIG_RE.test(filename) || CONFIG_PATHS.test(filename) || CONFIG_FILES.test(filename)) return 'config';
  if (SOURCE_RE.test(filename)) return 'source';
  return 'other';
}

/** Detect top-level module (first directory under project root). */
export function detectModule(filename: string, repoName?: string): string {
  if (!filename.includes('/')) return repoName ?? 'root';
  const match = filename.match(MODULE_DIR_RE);
  return match?.[1] ?? repoName ?? 'root';
}

export type ChangeCategory =
  | 'FEATURE' | 'BUG_FIX' | 'REFACTOR' | 'PERFORMANCE'
  | 'SECURITY' | 'UI' | 'API' | 'DATABASE'
  | 'CONFIG' | 'DOCUMENTATION' | 'TEST' | 'DEPENDENCY' | 'OTHER';

const STYLE_FILES_RE = /\.(css|scss|less|svelte|vue|tsx|jsx)$/i;
const UI_DIRS_RE = /(components?|pages?|views?|layouts?|ui|screens)/i;

function hasSourceTests(files: FileChange[]): boolean {
  return files.some((f) => f.filename.includes('test') || f.filename.includes('spec'));
}

function detectSecurityKeywords(files: FileChange[], message: string): boolean {
  const msg = message.toLowerCase();
  const hasAuth = /auth|token|oauth|jwt|session|password|crypt|secret/i.test(msg);
  const hasSecFiles = files.some((f) => /auth|token|oauth|security|crypto/i.test(f.filename));
  return hasAuth || hasSecFiles;
}

function detectDatabaseFiles(files: FileChange[]): boolean {
  return files.some((f) =>
    /(schema|migration|drizzle|prisma|database|db)\//i.test(f.filename)
    || /\.(sql)$/i.test(f.filename)
  );
}

function detectConfigOnly(files: FileChange[]): boolean {
  return files.every((f) =>
    detectFileType(f.filename) === 'config'
    || detectFileType(f.filename) === 'lockfile'
    || detectFileType(f.filename) === 'asset'
  );
}

function detectDocsOnly(files: FileChange[]): boolean {
  return files.every((f) => detectFileType(f.filename) === 'docs');
}

/**
 * Deterministic change categorization based on files + commit message.
 * Returns ordered categories (most likely first).
 */
export function categorizeChange(
  files: FileChange[],
  commitMessage: string
): { categories: ChangeCategory[]; affectedAreas: string[] } {
  const categories: ChangeCategory[] = [];
  const affectedAreas = new Set<string>();
  const msg = commitMessage.toLowerCase();
  const modules = files.map((f) => detectModule(f.filename));
  [...new Set(modules)].forEach((m) => affectedAreas.add(m));

  // Explicit commit-message patterns first (very reliable signal)
  if (/^(fix|bugfix|bug)[\s:]/i.test(commitMessage)) categories.push('BUG_FIX');
  if (/^(feat|feature|add|implement|new)[\s:]/i.test(commitMessage)) categories.push('FEATURE');
  if (/^(refactor|restructure|clean|reorganize)[\s:]/i.test(commitMessage)) categories.push('REFACTOR');
  if (/^(perf|performance|optimize|speed|cache)[\s:]/i.test(commitMessage)) categories.push('PERFORMANCE');
  if (/^(docs?|doc|readme|typo|spelling)[\s:]/i.test(commitMessage)) categories.push('DOCUMENTATION');
  if (/^(test|tests|spec)[\s:]/i.test(commitMessage)) categories.push('TEST');
  if (/^(chore|deps?|dependencies|bump|upgrade|lock)[\s:]/i.test(commitMessage)) categories.push('DEPENDENCY');
  if (/^(security|fix.*vulnerab|auth|oauth|token|encrypt)[\s:]/i.test(msg)) categories.push('SECURITY');
  if (/^(migrat|db|schema|database)[\s:]/i.test(msg)) categories.push('DATABASE');

  // File-content based heuristics (override/add based on actual changes)
  if (detectDatabaseFiles(files)) {
    if (!categories.includes('DATABASE')) categories.push('DATABASE');
    affectedAreas.add('database');
  }
  if (detectDocsOnly(files)) {
    if (!categories.includes('DOCUMENTATION')) categories.push('DOCUMENTATION');
  }
  if (detectConfigOnly(files) && categories.length === 0) {
    categories.push('CONFIG');
  }

  // UI detection
  const hasUIFiles = files.some((f) => STYLE_FILES_RE.test(f.filename) || UI_DIRS_RE.test(f.filename));
  if (hasUIFiles || /\bui|css|style|layout|design|button|modal|page\b/i.test(msg)) {
    if (!categories.includes('UI')) categories.push('UI');
    affectedAreas.add('ui');
  }

  // API detection
  if (/\bapi|route|endpoint|handler|controller|middleware\b/i.test(msg)
      || files.some((f) => /(route|controller|handler|middleware|api)\//i.test(f.filename))) {
    if (!categories.includes('API')) categories.push('API');
    affectedAreas.add('api');
  }

  // Security detection
  if (detectSecurityKeywords(files, commitMessage)) {
    if (!categories.includes('SECURITY')) categories.push('SECURITY');
    affectedAreas.add('auth');
  }

  // Test files
  if (hasSourceTests(files) && !categories.includes('TEST')) {
    categories.push('TEST');
    affectedAreas.add('tests');
  }

  // Fallback
  if (categories.length === 0) categories.push('OTHER');

  return { categories, affectedAreas: [...affectedAreas].slice(0, 8) };
}
