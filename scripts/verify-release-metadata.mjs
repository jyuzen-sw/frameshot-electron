import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const RELEASE_TAG_PATTERN =
  /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const GIT_OBJECT_ID_PATTERN = /^[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(message);
}

function requireObject(value, location) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${location} must be an object`);
  }
  return value;
}

function requireString(object, key, location) {
  const value = object[key];
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${location}.${key} must be a non-empty string`);
  }
  return value;
}

function requireGitObjectId(value, location) {
  if (!GIT_OBJECT_ID_PATTERN.test(value)) {
    fail(`${location} must be a 40-character hexadecimal Git object ID`);
  }
  return value;
}

function requireEqual(actual, expected, location) {
  if (actual !== expected) {
    fail(`${location} must be ${expected}, got ${actual}`);
  }
}

function requireValidVerification(value, location) {
  const verification = requireObject(value, location);
  if (verification.verified !== true || verification.reason !== 'valid') {
    fail(`${location} must be GitHub verified with reason valid`);
  }
}

export function verifyReleaseMetadata(value) {
  const metadata = requireObject(value, 'metadata');
  const tagName = requireString(metadata, 'tagName', 'metadata');
  const tagMatch = RELEASE_TAG_PATTERN.exec(tagName);
  if (!tagMatch) {
    fail(`metadata.tagName is not an exact release tag: ${tagName}`);
  }

  const version = tagName.slice(1);
  const packageVersion = requireString(
    metadata,
    'packageVersion',
    'metadata',
  );
  requireEqual(packageVersion, version, 'metadata.packageVersion');

  const tagRef = requireObject(metadata.tagRef, 'metadata.tagRef');
  requireEqual(
    requireString(tagRef, 'ref', 'metadata.tagRef'),
    `refs/tags/${tagName}`,
    'metadata.tagRef.ref',
  );
  const tagRefObject = requireObject(
    tagRef.object,
    'metadata.tagRef.object',
  );
  requireEqual(
    requireString(tagRefObject, 'type', 'metadata.tagRef.object'),
    'tag',
    'metadata.tagRef.object.type',
  );
  const tagObjectSha = requireGitObjectId(
    requireString(tagRefObject, 'sha', 'metadata.tagRef.object'),
    'metadata.tagRef.object.sha',
  );

  const tagObject = requireObject(metadata.tagObject, 'metadata.tagObject');
  requireEqual(
    requireGitObjectId(
      requireString(tagObject, 'sha', 'metadata.tagObject'),
      'metadata.tagObject.sha',
    ),
    tagObjectSha,
    'metadata.tagObject.sha',
  );
  requireEqual(
    requireString(tagObject, 'tag', 'metadata.tagObject'),
    tagName,
    'metadata.tagObject.tag',
  );
  requireValidVerification(
    tagObject.verification,
    'metadata.tagObject.verification',
  );

  const taggedObject = requireObject(
    tagObject.object,
    'metadata.tagObject.object',
  );
  requireEqual(
    requireString(taggedObject, 'type', 'metadata.tagObject.object'),
    'commit',
    'metadata.tagObject.object.type',
  );
  const commitSha = requireGitObjectId(
    requireString(taggedObject, 'sha', 'metadata.tagObject.object'),
    'metadata.tagObject.object.sha',
  );

  const commit = requireObject(metadata.commit, 'metadata.commit');
  requireEqual(
    requireGitObjectId(
      requireString(commit, 'sha', 'metadata.commit'),
      'metadata.commit.sha',
    ),
    commitSha,
    'metadata.commit.sha',
  );
  requireValidVerification(
    commit.verification,
    'metadata.commit.verification',
  );

  const mainRef = requireObject(metadata.mainRef, 'metadata.mainRef');
  requireEqual(
    requireString(mainRef, 'ref', 'metadata.mainRef'),
    'refs/heads/main',
    'metadata.mainRef.ref',
  );
  const mainRefObject = requireObject(
    mainRef.object,
    'metadata.mainRef.object',
  );
  requireEqual(
    requireString(mainRefObject, 'type', 'metadata.mainRef.object'),
    'commit',
    'metadata.mainRef.object.type',
  );
  requireEqual(
    requireGitObjectId(
      requireString(mainRefObject, 'sha', 'metadata.mainRef.object'),
      'metadata.mainRef.object.sha',
    ),
    commitSha,
    'metadata.mainRef.object.sha',
  );

  requireEqual(
    requireGitObjectId(
      requireString(metadata, 'checkedOutSha', 'metadata'),
      'metadata.checkedOutSha',
    ),
    commitSha,
    'metadata.checkedOutSha',
  );

  if (metadata.expectedTagObjectSha !== undefined) {
    requireEqual(
      requireGitObjectId(
        requireString(metadata, 'expectedTagObjectSha', 'metadata'),
        'metadata.expectedTagObjectSha',
      ),
      tagObjectSha,
      'metadata.expectedTagObjectSha',
    );
  }
  if (metadata.expectedCommitSha !== undefined) {
    requireEqual(
      requireGitObjectId(
        requireString(metadata, 'expectedCommitSha', 'metadata'),
        'metadata.expectedCommitSha',
      ),
      commitSha,
      'metadata.expectedCommitSha',
    );
  }

  return {
    tag: tagName,
    version,
    tag_object_sha: tagObjectSha,
    commit_sha: commitSha,
    asset_name: `FrameShot-${version}-Windows-x64-Portable.exe`,
  };
}

async function readInput(inputPath) {
  if (inputPath !== '-') {
    return readFile(path.resolve(inputPath), 'utf8');
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function runCli() {
  const inputPath = process.argv[2];
  if (!inputPath || process.argv.length !== 3) {
    fail('Usage: node scripts/verify-release-metadata.mjs <metadata.json|->');
  }

  const source = await readInput(inputPath);
  const metadata = JSON.parse(source);
  process.stdout.write(`${JSON.stringify(verifyReleaseMetadata(metadata))}\n`);
}

const executedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : undefined;
if (executedPath === import.meta.url) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
