// Pure feed-URL helpers. Deliberately free of electron/electron-updater
// imports so they can be unit tested outside an Electron runtime.

export const DEFAULT_REPO = 'grnd/grander-commander';

/** Fallback feed. Resolves via a redirect, so it can drift — see tagFeedUrl. */
export function latestFeedUrl(repo: string = DEFAULT_REPO): string {
  return `https://github.com/${repo}/releases/latest/download`;
}

/** Feed pinned to one release, so a check and its download cannot disagree. */
export function tagFeedUrl(tag: string, repo: string = DEFAULT_REPO): string {
  return `https://github.com/${repo}/releases/download/${tag}`;
}

/**
 * GitHub answers /releases/latest with a redirect to /releases/tag/<tag>.
 * Returns null when the location is missing or is not a tag URL; callers then
 * fall back to the /latest feed rather than guessing a tag.
 */
export function tagFromLatestRedirect(location: string | null | undefined): string | null {
  if (!location) return null;
  const m = /\/releases\/tag\/([^/?#]+)/.exec(location);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Human-facing release page for a version. Tags carry a leading "v". */
export function releaseNotesUrl(version: string, repo: string = DEFAULT_REPO): string {
  const tag = version.startsWith('v') ? version : `v${version}`;
  return `https://github.com/${repo}/releases/tag/${tag}`;
}
