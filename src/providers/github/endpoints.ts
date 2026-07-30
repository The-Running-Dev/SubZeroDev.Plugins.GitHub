import type { CollectionProfile } from '../provider.js';

export interface EndpointDescriptor {
  readonly resource: string;
  readonly path: string;
  readonly paginated: boolean;
  /** Explicit cap used by collectors and the profile-budget calculation. */
  readonly maxPages: number;
  readonly bucket: 'core' | 'search';
  readonly requestsPerPage: number;
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
    absenceMeaning: 'partial-failure',
    profiles: ['standard', 'detailed'],
  },
  {
    resource: 'latest-release',
    path: '/repos/{owner}/{repo}/releases/latest',
    paginated: false,
    maxPages: 1,
    bucket: 'core',
    requestsPerPage: 1,
    absenceMeaning: 'valid-null',
    profiles: ['standard', 'detailed'],
  },
  {
    resource: 'branches',
    path: '/repos/{owner}/{repo}/branches',
    paginated: true,
    maxPages: 1,
    bucket: 'core',
    requestsPerPage: 1,
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
    absenceMeaning: 'partial-failure',
    profiles: ['standard', 'detailed'],
  },
  {
    resource: 'contributors',
    path: '/repos/{owner}/{repo}/contributors',
    paginated: true,
    maxPages: 1,
    bucket: 'core',
    requestsPerPage: 1,
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
    absenceMeaning: 'partial-failure',
    profiles: ['detailed'],
  },
  {
    resource: 'issues',
    path: '/search/issues',
    paginated: true,
    maxPages: 1,
    bucket: 'search',
    requestsPerPage: 2,
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
