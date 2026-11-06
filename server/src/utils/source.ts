// The "Source code" link (NEW-20). The AGPL asks a server that runs changed code to offer its users that
// code, so the app links to the exact version it runs.

export const SOURCE_REPO = 'https://github.com/TidyQuest/TidyQuest';

/**
 * Where this running version's code is: a release links to its tag (v0.15.1), a :main build to its commit
 * (APP_BUILD is "main · 7e18930"). SOURCE_URL replaces it: anyone running a changed copy must point it at
 * their own code. Only http(s) addresses count.
 */
export function sourceUrl(version: string | null, build = process.env.APP_BUILD, override = process.env.SOURCE_URL): string {
  const own = override?.trim();
  if (own && /^https?:\/\/\S+$/i.test(own)) return own;
  const commit = build?.match(/·\s*([0-9a-f]{7,40})\s*$/i)?.[1];
  if (commit) return `${SOURCE_REPO}/tree/${commit}`;
  if (version) return `${SOURCE_REPO}/tree/v${version}`;
  return SOURCE_REPO;
}
