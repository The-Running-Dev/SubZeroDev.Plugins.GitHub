export interface RecordedRequest {
  readonly method: string;
  readonly url: URL;
  readonly headers: Readonly<Record<string, string>>;
}

export interface StubResponse {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

export interface StubRoute {
  readonly method: 'GET';
  readonly pathPattern: RegExp;
  readonly respond: (request: RecordedRequest, callIndex: number) => StubResponse;
}

export interface FetchStub {
  readonly fetch: typeof globalThis.fetch;
  readonly requests: readonly RecordedRequest[];
  countMatching(pattern: RegExp): number;
  assertNoUnmatchedRoutes(): void;
}

/** A deliberately small fetch double; unexpected endpoints are visible failures. */
export function createFetchStub(routes: readonly StubRoute[]): FetchStub {
  const requests: RecordedRequest[] = [];
  const unmatched: RecordedRequest[] = [];
  const calls = new Map<StubRoute, number>();

  const fetch: typeof globalThis.fetch = (input, init) => {
    const request = new Request(input, init);
    const recorded: RecordedRequest = {
      method: request.method,
      url: new URL(request.url),
      headers: Object.fromEntries(request.headers.entries()),
    };
    requests.push(recorded);
    const route = routes.find(
      (candidate) =>
        candidate.method === recorded.method &&
        candidate.pathPattern.test(`${recorded.url.pathname}${recorded.url.search}`),
    );
    if (route === undefined) {
      unmatched.push(recorded);
      return Promise.resolve(
        new Response(JSON.stringify({ message: 'Unexpected request' }), { status: 501 }),
      );
    }
    const callIndex = calls.get(route) ?? 0;
    calls.set(route, callIndex + 1);
    const response = route.respond(recorded, callIndex);
    return Promise.resolve(
      new Response(response.body === undefined ? null : JSON.stringify(response.body), {
        status: response.status,
        ...(response.headers === undefined ? {} : { headers: response.headers }),
      }),
    );
  };

  return {
    fetch,
    requests,
    countMatching: (pattern) =>
      requests.filter((request) => pattern.test(`${request.url.pathname}${request.url.search}`))
        .length,
    assertNoUnmatchedRoutes: () => {
      if (unmatched.length > 0) {
        throw new Error(
          `Unexpected GitHub requests: ${unmatched.map((request) => request.url.toString()).join(', ')}`,
        );
      }
    },
  };
}
