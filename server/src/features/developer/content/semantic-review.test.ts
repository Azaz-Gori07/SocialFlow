import { semanticReview, HUMANLIKE_FLOOR } from './semantic-review';

describe('semanticReview (humanLike gate)', () => {
  it('rejects obvious AI-slop below the floor', () => {
    const slop = 'In today\'s fast-paced digital landscape, we leverage cutting-edge solutions to synergize with stakeholders and unlock the power of developer workflows.';
    const res = semanticReview(slop);
    expect(res.humanLike).toBeLessThan(HUMANLIKE_FLOOR);
    expect(res.issues.length).toBeGreaterThanOrEqual(3);
  });

  it('passes a grounded technical post with a healthy score', () => {
    const real = `Spotted a sneaky UX blocker in our GitHub OAuth flow: the auth popup was being swallowed by popup blockers.
We replaced the popup with same-tab navigation, so the blocker never triggers. Users were stuck on a spinner before; now the redirect is immediate.`;
    const res = semanticReview(real);
    expect(res.humanLike).toBeGreaterThanOrEqual(HUMANLIKE_FLOOR);
    expect(res.issues).toHaveLength(0);
  });

  it('penalizes each pattern cumulatively and never goes below zero', () => {
    const res = semanticReview('synergy synergy synergy synergy synergy synergy synergy');
    expect(res.humanLike).toBeGreaterThanOrEqual(0);
  });
});
