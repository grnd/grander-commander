import { describe, it, expect } from 'vitest';
import { cloudVolumeNames } from '@main/volumes/list';

describe('cloudVolumeNames', () => {
  it('uses the provider segment as the display name', () => {
    expect(cloudVolumeNames(['GoogleDrive-danny.grander@gmail.com'])).toEqual([
      { dir: 'GoogleDrive-danny.grander@gmail.com', name: 'GoogleDrive' },
    ]);
  });

  it('leaves provider-only names alone', () => {
    expect(cloudVolumeNames(['Dropbox'])).toEqual([
      { dir: 'Dropbox', name: 'Dropbox' },
    ]);
  });

  it('falls back to the full folder name when one provider has several accounts', () => {
    expect(
      cloudVolumeNames(['GoogleDrive-a@gmail.com', 'GoogleDrive-b@gmail.com', 'Dropbox']),
    ).toEqual([
      { dir: 'GoogleDrive-a@gmail.com', name: 'GoogleDrive-a@gmail.com' },
      { dir: 'GoogleDrive-b@gmail.com', name: 'GoogleDrive-b@gmail.com' },
      { dir: 'Dropbox', name: 'Dropbox' },
    ]);
  });

  it('skips dotfiles such as .DS_Store', () => {
    expect(cloudVolumeNames(['.DS_Store', 'Dropbox'])).toEqual([
      { dir: 'Dropbox', name: 'Dropbox' },
    ]);
  });
});
