import { factCheckPost } from './fact-checker';

const ev = { prNumbers: [1], issueNumbers: [], commitCount: 2, fileCount: 5, totalAdditions: 300, totalDeletions: 100 };

describe('fact-checker mechanism inversion (F5 §6)', () => {
  it('flags "now reliably opens" claims about a component the evidence says was removed', () => {
    const post = 'Great news: `window.open()` now reliably opens auth flows for users.';
    const res = factCheckPost(post, ev, {
      activityTitle: 'fix(client): GitHub OAuth opens in same tab',
      evidenceText: 'fix(client): GitHub OAuth opens in same tab — window.open() gets silently dropped by popup blockers; navigate the current tab instead'
    });
    const inversion = res.issues.find((i) => i.message.startsWith('Mechanism inversion'));
    expect(inversion).toBeDefined();
    expect(res.passed).toBe(false);
  });

  it('flags "fixed X" when evidence says X was replaced', () => {
    const res = factCheckPost('We fixed the popup flow so logins work every time.', ev, {
      activityTitle: 'replaced the popup flow with same-tab navigation',
      evidenceText: 'replaced the popup flow entirely — navigating in the same tab'
    });
    const inversion = res.issues.find((i) => i.message.startsWith('Mechanism inversion'));
    expect(inversion).toBeDefined();
  });

  it('does NOT flag aligned phrasing ("we removed X")', () => {
    const res = factCheckPost('We removed the legacy popup flow and navigate in the same tab now.', ev, {
      activityTitle: 'removed the popup flow',
      evidenceText: 'removed the popup flow; same-tab navigation'
    });
    expect(res.issues.find((i) => i.message.startsWith('Mechanism inversion'))).toBeUndefined();
    expect(res.passed).toBe(true);
  });

  it('does not flag claims about terms absent from removal context', () => {
    const res = factCheckPost('We fixed the retry queue so deliveries recover.', ev, {
      activityTitle: 'fix: retry queue recovery',
      evidenceText: 'removed the legacy popup flow; unrelated to retry'
    });
    expect(res.issues.find((i) => i.message.startsWith('Mechanism inversion'))).toBeUndefined();
  });

  it('skips the check entirely when no evidenceText is provided', () => {
    const res = factCheckPost('`window.open()` now reliably opens auth flows.', ev);
    expect(res.issues.find((i) => i.message.startsWith('Mechanism inversion'))).toBeUndefined();
  });
});
