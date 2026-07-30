/**
 * Builds an endpoint URL under `baseUrl`, **preserving any path prefix it carries**.
 *
 * `new URL('/user', 'https://github.example.com/api/v3')` resolves to
 * `https://github.example.com/user` — a root-relative reference replaces the whole path,
 * so a GitHub Enterprise base silently loses its `/api/v3` and every request lands on an
 * endpoint that does not exist. Passing the path as relative against a base with a
 * trailing slash keeps the prefix.
 *
 * Query parameters are set here rather than by the caller so no endpoint has to remember
 * which of the two URL constructions it used.
 */
export function githubUrl(
  baseUrl: string,
  path: string,
  parameters: Readonly<Record<string, string>> = {},
): URL {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(path.replace(/^\/+/, ''), base);
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
  return url;
}
