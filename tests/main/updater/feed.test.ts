import { describe, it, expect } from 'vitest';
import { latestFeedUrl, tagFeedUrl, tagFromLatestRedirect, releaseNotesUrl } from '@main/updater/feed';

describe('update feed URLs', () => {
  it('builds the /latest/download feed used as the fallback', () => {
    expect(latestFeedUrl('grnd/grander-commander'))
      .toBe('https://github.com/grnd/grander-commander/releases/latest/download');
  });

  it('pins a concrete tag so check and download cannot disagree', () => {
    // /latest is a redirect; if a release is published between the check and
    // the download, the two resolve to different versions.
    expect(tagFeedUrl('v0.2.0', 'grnd/grander-commander'))
      .toBe('https://github.com/grnd/grander-commander/releases/download/v0.2.0');
  });
});

describe('tagFromLatestRedirect', () => {
  it('extracts the tag GitHub redirects /releases/latest to', () => {
    expect(tagFromLatestRedirect('https://github.com/grnd/grander-commander/releases/tag/v0.2.0'))
      .toBe('v0.2.0');
  });

  it('handles a relative Location header', () => {
    expect(tagFromLatestRedirect('/grnd/grander-commander/releases/tag/v1.2.3')).toBe('v1.2.3');
  });

  it('decodes percent-encoded tags', () => {
    expect(tagFromLatestRedirect('/o/r/releases/tag/v1.0.0%2Bbuild.5')).toBe('v1.0.0+build.5');
  });

  it('ignores query strings and fragments', () => {
    expect(tagFromLatestRedirect('/o/r/releases/tag/v9.9.9?foo=1#bar')).toBe('v9.9.9');
  });

  it('returns null when there is no redirect to follow', () => {
    expect(tagFromLatestRedirect(null)).toBeNull();
  });

  it('returns null for a URL that is not a release tag', () => {
    // Falling back to the /latest feed is correct here; guessing a tag is not.
    expect(tagFromLatestRedirect('https://github.com/grnd/grander-commander/releases')).toBeNull();
  });
});

describe('releaseNotesUrl', () => {
  it('points at the tag page for a version', () => {
    expect(releaseNotesUrl('0.1.6', 'grnd/grander-commander'))
      .toBe('https://github.com/grnd/grander-commander/releases/tag/v0.1.6');
  });

  it('does not double the v prefix when the version already has one', () => {
    expect(releaseNotesUrl('v0.1.6', 'grnd/grander-commander'))
      .toBe('https://github.com/grnd/grander-commander/releases/tag/v0.1.6');
  });
});
