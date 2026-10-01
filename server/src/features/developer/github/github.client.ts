import { GitHubTokenConfig } from '../developer.types';

export type { GitHubTokenConfig };

/**
 * Minimal GitHub REST client.
 *
 * SSRF posture: the API origin is hardcoded and every outbound URL — including
 * the `Link: rel="next"` URL GitHub hands back — is re-validated against it.
 * A configurable baseUrl was deliberately dropped so no environment variable
 * or request input can redirect credentials at an internal host.
 */
const GITHUB_API_ORIGIN = 'https://api.github.com';

/**
 * Hard ceiling per GitHub request. Without it a hung connection holds a sync
 * (and the HTTP request that triggered it) open indefinitely; the sync path
 * already records the failure and the webhook path acknowledges the delivery.
 */
const FETCH_TIMEOUT_MS = 15_000;

export class GitHubRateLimitError extends Error {
  constructor(
    public resetAt: Date,
    public remaining: number
  ) {
    super(`GitHub API rate limit exceeded. Resets at ${resetAt.toISOString()}`);
    this.name = 'GitHubRateLimitError';
  }
}

export class GitHubApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
}

export interface ApiResponse<T> {
  data: T;
  rateLimit: RateLimitInfo;
  nextPageUrl: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  rateLimit: RateLimitInfo;
}

export function parseLinkHeader(link: string | null): string | null {
  if (!link) return null;
  const match = link.match(/<([^>]+)>;\s*rel="next"/);
  return match?.[1] ?? null;
}

/** Resolve a path (or GitHub-supplied absolute URL) against the API origin. */
function buildUrl(path: string): string {
  const url = path.startsWith('http')
    ? new URL(path)
    : new URL(path, GITHUB_API_ORIGIN);
  if (url.protocol !== 'https:' || url.hostname !== 'api.github.com') {
    throw new GitHubApiError(400, `Refusing to call non-GitHub host: ${url.hostname}`);
  }
  return url.toString();
}

export async function githubFetch<T>(
  config: GitHubTokenConfig,
  path: string,
  options?: { method?: string; body?: unknown }
): Promise<ApiResponse<T>> {
  const url = buildUrl(path);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'SocialFlow-Developer/1.0'
  };
  if (options?.body) headers['Content-Type'] = 'application/json';

  const resp = await fetch(url, {
    method: options?.method ?? 'GET',
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });

  const rateLimit: RateLimitInfo = {
    limit: Number(resp.headers.get('x-ratelimit-limit') ?? 0),
    remaining: Number(resp.headers.get('x-ratelimit-remaining') ?? 0),
    reset: new Date(Number(resp.headers.get('x-ratelimit-reset') ?? 0) * 1000)
  };
  const nextPageUrl = parseLinkHeader(resp.headers.get('link'));

  if (resp.status === 403 && rateLimit.remaining === 0) {
    throw new GitHubRateLimitError(rateLimit.reset, rateLimit.remaining);
  }
  // 404 is an expected outcome (deleted commit detail, repo gone): callers
  // decide whether that is fatal.
  if (resp.status === 404 || resp.status === 204) {
    return { data: null as unknown as T, rateLimit, nextPageUrl };
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new GitHubApiError(resp.status, `GitHub API ${resp.status}: ${body.slice(0, 200)}`);
  }
  return { data: (await resp.json()) as T, rateLimit, nextPageUrl };
}

/** Follow `Link: rel="next"` up to maxPages. */
export async function githubFetchAll<T>(
  config: GitHubTokenConfig,
  path: string,
  maxPages = 10
): Promise<PaginatedResponse<T>> {
  const allData: T[] = [];
  let currentUrl = path;
  let rateLimit: RateLimitInfo = { limit: 0, remaining: 0, reset: new Date() };
  for (let page = 0; page < maxPages; page++) {
    const result = await githubFetch<T[]>(config, currentUrl);
    rateLimit = result.rateLimit;
    if (Array.isArray(result.data)) allData.push(...result.data);
    if (!result.nextPageUrl) break;
    currentUrl = result.nextPageUrl;
  }
  return { data: allData, rateLimit };
}

/* -------------------------------------------------------------------------- */
/                                Resource helpers                             */
/* -------------------------------------------------------------------------- */

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  default_branch: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  owner: { login: string; avatar_url: string; id: number };
  updated_at: string;
  created_at: string;
  pushed_at: string;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string };
    committer: { name: string; email: string; date: string };
  };
  author: { login: string; avatar_url: string; id: number } | null;
  stats?: { additions: number; deletions: number; total: number };
  files?: Array<{
    filename: string;
    status: string;
    additions?: number;
    deletions?: number;
    changes?: number;
    previous_filename?: string | null;
  }>;
  html_url: string;
  verification?: { verified: boolean };
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  user: { login: string; avatar_url: string } | null;
  head: { ref: string; label: string };
  base: { ref: string; label: string };
  labels: Array<{ name: string }>;
  additions: number;
  deletions: number;
  changed_files: number;
  merged: boolean;
  merged_at: string | null;
  merged_by: { login: string } | null;
  closed_at: string | null;
  comments: number;
  review_comments: number;
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  user: { login: string; avatar_url: string } | null;
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
  milestone: { title: string } | null;
  comments: number;
  closed_at: string | null;
  html_url: string;
  pull_request?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  author: { login: string; avatar_url: string } | null;
  draft: boolean;
  prerelease: boolean;
  assets: Array<{ id: number; name: string }>;
  html_url: string;
  published_at: string | null;
  created_at: string;
}

export function getUser(config: GitHubTokenConfig): Promise<ApiResponse<GitHubUser>> {
  return githubFetch<GitHubUser>(config, '/user');
}

export function getRepositories(config: GitHubTokenConfig): Promise<PaginatedResponse<GitHubRepository>> {
  return githubFetchAll<GitHubRepository>(config, '/user/repos?per_page=100&sort=updated&direction=desc');
}

export function getRepository(
  config: GitHubTokenConfig,
  owner: string,
  repo: string
): Promise<ApiResponse<GitHubRepository>> {
  return githubFetch<GitHubRepository>(config, `/repos/${owner}/${repo}`);
}

export function getCommits(
  config: GitHubTokenConfig,
  owner: string,
  repo: string,
  options?: { since?: string; perPage?: number }
): Promise<PaginatedResponse<GitHubCommit>> {
  const params = new URLSearchParams({ per_page: String(options?.perPage ?? 100) });
  if (options?.since) params.set('since', options.since);
  return githubFetchAll<GitHubCommit>(config, `/repos/${owner}/${repo}/commits?${params.toString()}`);
}

export function getCommitDetail(
  config: GitHubTokenConfig,
  owner: string,
  repo: string,
  sha: string
): Promise<ApiResponse<GitHubCommit>> {
  return githubFetch<GitHubCommit>(config, `/repos/${owner}/${repo}/commits/${sha}`);
}

export function getPullRequests(
  config: GitHubTokenConfig,
  owner: string,
  repo: string
): Promise<PaginatedResponse<GitHubPullRequest>> {
  return githubFetchAll<GitHubPullRequest>(
    config,
    `/repos/${owner}/${repo}/pulls?state=all&per_page=100&sort=updated&direction=desc`
  );
}

export function getIssues(
  config: GitHubTokenConfig,
  owner: string,
  repo: string
): Promise<PaginatedResponse<GitHubIssue>> {
  return githubFetchAll<GitHubIssue>(
    config,
    `/repos/${owner}/${repo}/issues?state=all&per_page=100&sort=updated&direction=desc`
  );
}

export function getReleases(
  config: GitHubTokenConfig,
  owner: string,
  repo: string
): Promise<PaginatedResponse<GitHubRelease>> {
  return githubFetchAll<GitHubRelease>(config, `/repos/${owner}/${repo}/releases?per_page=100`);
}
