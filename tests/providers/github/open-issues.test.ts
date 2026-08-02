import { describe, expect, it } from 'vitest';

import { correctOpenIssueCount } from '../../../src/providers/github/open-issues.js';

describe('GitHub open issue correction', () => {
  it('subtracts open pull requests from GitHub open_issues_count', () => {
    expect(correctOpenIssueCount(10, 4)).toEqual({
      reportedOpenIssuesAndPullRequests: 10,
      openPullRequests: 4,
      openIssues: 6,
    });
  });

  it('returns null when the pull request count is unavailable', () => {
    expect(correctOpenIssueCount(10, null).openIssues).toBeNull();
  });

  it('clamps an inconsistent eventually-consistent response at zero', () => {
    expect(correctOpenIssueCount(2, 3).openIssues).toBe(0);
  });

  it('refuses invalid counts', () => {
    expect(() => correctOpenIssueCount(-1, 0)).toThrow(RangeError);
    expect(() => correctOpenIssueCount(1, -1)).toThrow(RangeError);
  });
});
