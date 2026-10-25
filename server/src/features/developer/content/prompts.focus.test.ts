import { focusStoryEvidence, buildStoryContext, serializeStoryContext } from './prompts';

const manyChanges = Array.from({ length: 40 }, (_, i) => `commit message #${40 - i}`);
const evidence = {
  prNumbers: [], issueNumbers: [], commitCount: 41, fileCount: 280,
  totalAdditions: 67000, totalDeletions: 14000
};

describe('focusStoryEvidence (evidence dilution fix)', () => {
  it('trims to the 5 newest messages and pins focusCommit above the threshold', () => {
    const res = focusStoryEvidence({ changes: manyChanges, commitCount: 41 });
    expect(res.changes).toHaveLength(5);
    expect(res.changes[0]).toBe('commit message #40');
    expect(res.focusCommit).toBe('commit message #40');
  });

  it('keeps everything at or below the threshold', () => {
    const few = ['a', 'b', 'c'];
    const res = focusStoryEvidence({ changes: few, commitCount: 3 });
    expect(res.changes).toEqual(few);
    expect(res.focusCommit).toBe('a');
  });

  it('serializes the PRIMARY COMMIT instruction into the prompt context', () => {
    const ctx = buildStoryContext({
      projectName: 'SocialFlow',
      activityTitle: 'Changes to client: fix(client): OAuth same tab',
      focusCommit: 'fix(client): OAuth same tab',
      changes: focusStoryEvidence({ changes: manyChanges, commitCount: 41 }).changes,
      affectedAreas: ['client'],
      evidence
    });
    const text = serializeStoryContext(ctx);
    expect(text).toContain('PRIMARY COMMIT — describe this specific work, not the group history: fix(client): OAuth same tab');
    expect(text.match(/  - commit message/g)?.length).toBe(5);
    expect(text).not.toContain('commit message #35');
  });
});
