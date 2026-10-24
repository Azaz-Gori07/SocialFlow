import { draftsTowardScheduleCap } from './smart-skip';

const now = new Date('2026-10-24T12:00:00.000Z');
const twoDaysAgo = new Date(now.getTime() - 2 * 86400 * 1000);
const tenDaysAgo = new Date(now.getTime() - 10 * 86400 * 1000);
const weekStart = new Date(now.getTime() - 7 * 86400 * 1000);

describe('draftsTowardScheduleCap', () => {
  it('counts non-failed drafts inside the window', () => {
    const drafts = [
      { createdAt: twoDaysAgo, status: 'draft' },
      { createdAt: twoDaysAgo, status: 'published' },
      { createdAt: twoDaysAgo, status: 'scheduled' }
    ];
    expect(draftsTowardScheduleCap(drafts, weekStart)).toBe(3);
  });

  it('excludes failed drafts so failed generations cannot starve the schedule', () => {
    const drafts = [
      { createdAt: twoDaysAgo, status: 'failed' },
      { createdAt: twoDaysAgo, status: 'failed' },
      { createdAt: twoDaysAgo, status: 'draft' }
    ];
    expect(draftsTowardScheduleCap(drafts, weekStart)).toBe(1);
  });

  it('excludes drafts older than the window regardless of status', () => {
    const drafts = [
      { createdAt: tenDaysAgo, status: 'draft' },
      { createdAt: tenDaysAgo, status: 'published' },
      { createdAt: twoDaysAgo, status: 'draft' }
    ];
    expect(draftsTowardScheduleCap(drafts, weekStart)).toBe(1);
  });

  it('accepts string timestamps and returns 0 for an empty list', () => {
    expect(draftsTowardScheduleCap([], weekStart)).toBe(0);
    expect(
      draftsTowardScheduleCap([{ createdAt: twoDaysAgo.toISOString(), status: 'ready' }], weekStart)
    ).toBe(1);
  });
});
