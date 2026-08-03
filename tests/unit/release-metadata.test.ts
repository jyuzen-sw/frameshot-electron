import { describe, expect, it } from 'vitest';

const TAG_OBJECT_SHA = '1'.repeat(40);
const COMMIT_SHA = '2'.repeat(40);
const OTHER_SHA = '3'.repeat(40);
const verifierModulePath = '../../scripts/verify-release-metadata.mjs';
const { verifyReleaseMetadata } = (await import(verifierModulePath)) as {
  verifyReleaseMetadata: (metadata: unknown) => {
    asset_name: string;
    commit_sha: string;
    tag: string;
    tag_object_sha: string;
    version: string;
  };
};

interface MetadataFixture {
  checkedOutSha?: string;
  commit?: {
    sha?: string;
    verification?: { reason?: string; verified?: boolean };
  };
  expectedCommitSha?: string;
  expectedTagObjectSha?: string;
  mainRef?: {
    object?: { sha?: string; type?: string };
    ref?: string;
  };
  packageVersion?: string;
  tagName?: string;
  tagObject?: {
    object?: { sha?: string; type?: string };
    sha?: string;
    tag?: string;
    verification?: { reason?: string; verified?: boolean };
  };
  tagRef?: {
    object?: { sha?: string; type?: string };
    ref?: string;
  };
}

function validMetadata(): MetadataFixture {
  return {
    tagName: 'v1.2.3',
    packageVersion: '1.2.3',
    checkedOutSha: COMMIT_SHA,
    tagRef: {
      ref: 'refs/tags/v1.2.3',
      object: { type: 'tag', sha: TAG_OBJECT_SHA },
    },
    tagObject: {
      sha: TAG_OBJECT_SHA,
      tag: 'v1.2.3',
      object: { type: 'commit', sha: COMMIT_SHA },
      verification: { verified: true, reason: 'valid' },
    },
    commit: {
      sha: COMMIT_SHA,
      verification: { verified: true, reason: 'valid' },
    },
    mainRef: {
      ref: 'refs/heads/main',
      object: { type: 'commit', sha: COMMIT_SHA },
    },
  };
}

function expectRejected(metadata: MetadataFixture, message: string): void {
  expect(() => verifyReleaseMetadata(metadata)).toThrow(message);
}

describe('release metadata verification', () => {
  it('accepts a signed annotated release tag that directly identifies the checked-out main commit', () => {
    expect(verifyReleaseMetadata(validMetadata())).toEqual({
      tag: 'v1.2.3',
      version: '1.2.3',
      tag_object_sha: TAG_OBJECT_SHA,
      commit_sha: COMMIT_SHA,
      asset_name: 'FrameShot-1.2.3-Windows-x64-Portable.exe',
    });
  });

  it.each(['release-1.2.3', 'v01.2.3', 'v1.02.3', 'v1.2.03', 'v1.2.3-rc.1'])(
    'rejects non-exact release tag %s',
    (tagName) => {
      const metadata = validMetadata();
      metadata.tagName = tagName;
      expectRejected(metadata, 'not an exact release tag');
    },
  );

  it('rejects a lightweight tag', () => {
    const metadata = validMetadata();
    metadata.tagRef!.object!.type = 'commit';
    expectRejected(metadata, 'metadata.tagRef.object.type must be tag');
  });

  it('rejects a tag that points to another tag', () => {
    const metadata = validMetadata();
    metadata.tagObject!.object!.type = 'tag';
    expectRejected(metadata, 'metadata.tagObject.object.type must be commit');
  });

  it.each([
    ['tag', 'verification', 'tagObject'],
    ['commit', 'verification', 'commit'],
  ] as const)(
    'rejects an unverified %s signature',
    (_label, messageLocation, subject) => {
      const metadata = validMetadata();
      metadata[subject]!.verification = {
        verified: false,
        reason: 'unsigned',
      };
      expectRejected(metadata, `${subject}.${messageLocation}`);
    },
  );

  it.each([
    ['tag', 'tagObject'],
    ['commit', 'commit'],
  ] as const)(
    'rejects a %s signature whose verification reason is not valid',
    (_label, subject) => {
      const metadata = validMetadata();
      metadata[subject]!.verification = {
        verified: true,
        reason: 'unknown_signing_key',
      };
      expectRejected(metadata, `${subject}.verification`);
    },
  );

  it('rejects a package version that differs from the tag', () => {
    const metadata = validMetadata();
    metadata.packageVersion = '1.2.4';
    expectRejected(metadata, 'metadata.packageVersion must be 1.2.3');
  });

  it('rejects a tag commit that differs from main HEAD', () => {
    const metadata = validMetadata();
    metadata.mainRef!.object!.sha = OTHER_SHA;
    expectRejected(metadata, 'metadata.mainRef.object.sha');
  });

  it('rejects a checkout that differs from the signed tag commit', () => {
    const metadata = validMetadata();
    metadata.checkedOutSha = OTHER_SHA;
    expectRejected(metadata, 'metadata.checkedOutSha');
  });

  it('rejects a tag object identity that changed after validation', () => {
    const metadata = validMetadata();
    metadata.expectedTagObjectSha = OTHER_SHA;
    expectRejected(metadata, 'metadata.expectedTagObjectSha');
  });

  it('rejects a commit identity that changed after validation', () => {
    const metadata = validMetadata();
    metadata.expectedCommitSha = OTHER_SHA;
    expectRejected(metadata, 'metadata.expectedCommitSha');
  });

  it.each([
    'tagRef',
    'tagObject',
    'commit',
    'mainRef',
  ] as const)('fails closed when %s metadata is missing', (field) => {
    const metadata = validMetadata();
    delete metadata[field];
    expectRejected(metadata, `metadata.${field} must be an object`);
  });

  it('fails closed when GitHub omits commit verification metadata', () => {
    const metadata = validMetadata();
    delete metadata.commit!.verification;
    expectRejected(
      metadata,
      'metadata.commit.verification must be an object',
    );
  });
});
