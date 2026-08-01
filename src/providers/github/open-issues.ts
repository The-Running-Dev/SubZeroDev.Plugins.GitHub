export interface OpenIssueCorrection {
  readonly reportedOpenIssuesAndPullRequests: number;
  readonly openPullRequests: number | null;
  readonly openIssues: number | null;
}

/** GitHub's `open_issues_count` includes pull requests; never expose it uncorrected. */
export function correctOpenIssueCount(
  reported: number,
  openPullRequests: number | null,
): OpenIssueCorrection {
  if (!Number.isSafeInteger(reported) || reported < 0) {
    throw new RangeError('Reported open issue count must be a non-negative safe integer.');
  }
  if (
    openPullRequests !== null &&
    (!Number.isSafeInteger(openPullRequests) || openPullRequests < 0)
  ) {
    throw new RangeError('Open pull request count must be null or a non-negative safe integer.');
  }
  return {
    reportedOpenIssuesAndPullRequests: reported,
    openPullRequests,
    openIssues: openPullRequests === null ? null : Math.max(0, reported - openPullRequests),
  };
}
