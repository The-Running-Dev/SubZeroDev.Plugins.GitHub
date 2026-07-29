/** Extracts the page number from GitHub's RFC 8288 `rel="last"` link. */
export function parseLastPage(linkHeader: string | null): number | null {
  if (linkHeader === null) return null;
  for (const part of linkHeader.split(',')) {
    if (!/\brel="?last"?/i.test(part)) continue;
    const match = /[?&]page=(\d+)/.exec(part);
    if (match?.[1] === undefined) return null;
    const page = Number(match[1]);
    return Number.isSafeInteger(page) && page > 0 ? page : null;
  }
  return null;
}
