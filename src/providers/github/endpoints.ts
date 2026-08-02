import type { CollectionProfile } from '../provider.js';

export interface EndpointDescriptor {
  readonly resource: string;
  readonly path: string;
  readonly paginated: boolean;
  /** Explicit cap used by collectors and the profile-budget calculation. */
  readonly maxPages: number;
  readonly bucket: 'core' | 'search';
  readonly requestsPerPage: number;
  readonly supportsEtag: boolean;
  readonly fallback: 'none' | 'empty-collection' | 'null-with-diagnostic' | 'correct-open-issues';
  readonly absenceMeaning: 'valid-null' | 'partial-failure';
  readonly profiles: readonly CollectionProfile[];
}

/**
 * The request budget is data, not scattered collector constants. Each collector
 * must correspond to one entry here before it can spend a GitHub API request.
 */
export const ENDPOINTS: readonly EndpointDescriptor[] = [
  {
    resource: 'repository',
    path: '/repos/{owner}/{repo}',
    paginated: false,
    maxPages: 1,
    bucket: 'core',
    requestsPerPage: 0,
    supportsEtag: true,
    fallback: 'none',
    absenceMeaning: 'partial-failure',
    profiles: ['basic', 'standard', 'detailed'],
  },
  {
    resource: 'languages',
    path: '/repos/{owner}/{repo}/languages',
    paginated: false,
    maxPages: 1,
    bucket: 'core',
    requestsPerPage: 1,
    supportsEtag: true,
    fallback: 'null-with-diagnostic',
    absenceMeaning: 'partial-failure',
    profiles: ['standard', 'detailed'],
  },
  {
    resource: 'releases',
    path: '/repos/{owner}/{repo}/releases',
    paginated: true,
    maxPages: 1,
    bucket: 'core',
    requestsPerPage: 1,
    supportsEtag: true,
    fallback: 'empty-collection',
    absenceMeaning: 'valid-null',
    profiles: ['standard', 'detailed'],
  },
  {
    resource: 'latest-release',
    path: '/repos/{owner}/{repo}/releases/latest',
    paginated: false,
    maxPages: 1,
    bucket: 'core',
    requestsPerPage: 1,
    supportsEtag: true,
    fallback: 'empty-collection',
    absenceMeaning: 'valid-null',
    profiles: ['standard', 'detailed'],
  },
  {
    resource: 'branches',
    path: '/repos/{owner}/{repo}/branches',
    paginated: true,
    maxPages: 25,
    bucket: 'core',
    requestsPerPage: 1,
    supportsEtag: true,
    fallback: 'null-with-diagnostic',
    absenceMeaning: 'partial-failure',
    profiles: ['standard', 'detailed'],
  },
  {
    resource: 'tags',
    path: '/repos/{owner}/{repo}/tags',
    paginated: true,
    maxPages: 1,
    bucket: 'core',
    requestsPerPage: 1,
    supportsEtag: true,
    fallback: 'empty-collection',
    absenceMeaning: 'partial-failure',
    profiles: ['standard', 'detailed'],
  },
  {
    resource: 'contributors',
    path: '/repos/{owner}/{repo}/contributors',
    paginated: true,
    maxPages: 5,
    bucket: 'core',
    requestsPerPage: 1,
    supportsEtag: true,
    fallback: 'null-with-diagnostic',
    absenceMeaning: 'partial-failure',
    profiles: ['detailed'],
  },
  {
    resource: 'commits',
    path: '/repos/{owner}/{repo}/commits',
    paginated: true,
    maxPages: 1,
    bucket: 'core',
    requestsPerPage: 1,
    supportsEtag: true,
    fallback: 'null-with-diagnostic',
    absenceMeaning: 'valid-null',
    profiles: ['detailed'],
  },
  {
    resource: 'pull-requests',
    path: '/search/issues',
    paginated: true,
    maxPages: 1,
    bucket: 'search',
    requestsPerPage: 2,
    supportsEtag: false,
    fallback: 'null-with-diagnostic',
    absenceMeaning: 'partial-failure',
    profiles: ['detailed'],
  },
  {
    resource: 'issues',
    path: '/search/issues',
    paginated: true,
    maxPages: 1,
    bucket: 'search',
    requestsPerPage: 1,
    supportsEtag: false,
    fallback: 'correct-open-issues',
    absenceMeaning: 'partial-failure',
    profiles: ['detailed'],
  },
];

export function budgetForProfile(profile: CollectionProfile): {
  readonly core: number;
  readonly search: number;
} {
  return ENDPOINTS.reduce(
    (budget, endpoint) =>
      endpoint.profiles.includes(profile)
        ? {
            ...budget,
            [endpoint.bucket]:
              budget[endpoint.bucket] + endpoint.requestsPerPage * endpoint.maxPages,
          }
        : budget,
    { core: 0, search: 0 },
  );
}
