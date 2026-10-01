/**
 * Shared types for the Developer Intelligence feature.
 * Kept deliberately small — later phases extend this file as sync/pipeline
 * modules land rather than duplicating local unions.
 */

/** What triggered a sync run. Mirrors the `source` enum on DeveloperSyncLog. */
export type DeveloperSyncSource = 'manual' | 'webhook' | 'scheduled';

/**
 * Coarse sync unit, recorded on each sync log for debugging.
 * GitHub webhook deliveries map onto these plus 'push' | 'pull_request' |
 * 'issues' | 'release'.
 */
export type DeveloperEventType =
  | 'repo_sync'
  | 'commit_sync'
  | 'pr_sync'
  | 'issue_sync'
  | 'release_sync'
  | 'push'
  | 'pull_request'
  | 'issues'
  | 'release';

/**
 * Minimal credentials for talking to the GitHub REST API.
 * The API origin is fixed inside the client — there is deliberately no baseUrl
 * override, so no configuration can redirect a token to another host.
 */
export interface GitHubTokenConfig {
  token: string;
}

/** Record counts produced by a single sync run, for the sync log summary. */
export interface SyncRunResult {
  commits: number;
  pullRequests: number;
  issues: number;
  releases: number;
}
