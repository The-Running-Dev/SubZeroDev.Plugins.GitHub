import { z } from 'zod';

import type { Diagnostic } from '../../../models/diagnostics.js';
import type { IssueSummary, PullRequestSummary } from '../../../models/statistics.js';
import { searchResourceKey } from '../resource-keys.js';
import { githubUrl } from '../urls.js';
import { correctOpenIssueCount } from '../open-issues.js';

import type { CollectorContext } from './shared.js';
import { collected, type CollectorResult, unavailableFromError } from './result.js';

const searchCountSchema = z.object({ total_count: z.number().int().nonnegative() });

export interface IssueAndPullRequestCounts {
  readonly issues: IssueSummary;
  readonly pullRequests: PullRequestSummary;
}

export async function collectIssueAndPullRequestCounts(
  context: CollectorContext,
  reportedOpenIssuesAndPullRequests: number | null,
): Promise<CollectorResult<IssueAndPullRequestCounts>> {
  const diagnostics: Diagnostic[] = [];
  const openPullRequests = await searchCount(context, 'is:pr is:open');
  const closedPullRequests = await searchCount(context, 'is:pr is:closed');
  const closedIssues = await searchCount(context, 'is:issue is:closed');
  diagnostics.push(
    ...openPullRequests.diagnostics,
    ...closedPullRequests.diagnostics,
    ...closedIssues.diagnostics,
  );

  const openIssues =
    reportedOpenIssuesAndPullRequests === null
      ? null
      : correctOpenIssueCount(reportedOpenIssuesAndPullRequests, openPullRequests.value).openIssues;
  if (reportedOpenIssuesAndPullRequests === null) {
    diagnostics.push({
      code: 'github_open_issue_total_unavailable',
      message: 'GitHub did not provide open_issues_count, so open issues cannot be corrected.',
      resource: context.target.repository.webUrl,
      detail: null,
      retryable: false,
    });
  }

  return {
    value: {
      issues: { open: openIssues, closed: closedIssues.value },
      pullRequests: {
        open: openPullRequests.value,
        closed: closedPullRequests.value,
      },
    },
    diagnostics,
  };
}

async function searchCount(
  context: CollectorContext,
  qualifiers: string,
): Promise<CollectorResult<number>> {
  const query = `repo:${context.target.repository.slug} ${qualifiers}`;
  const resource = searchResourceKey(context.target.repository.identity.providerId, qualifiers);
  const url = githubUrl(context.client.baseUrl, 'search/issues', {
    q: query,
    per_page: '1',
    page: '1',
  }).toString();
  const response = await context.client.requester.get(
    { resource, url, bucket: 'search', subject: context.target.repository.slug },
    (value) => searchCountSchema.parse(value),
  );
  if (!response.ok) return unavailableFromError(response.error, url);
  if (response.value.data === null)
    return unavailableFromError(
      {
        kind: 'response-shape',
        code: 'github_search_unavailable',
        message: 'GitHub returned no Search API count.',
        subject: context.target.repository.slug,
        retryable: false,
        status: response.value.status,
      },
      url,
    );
  return collected(response.value.data.total_count);
}
