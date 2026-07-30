import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

async function assertNonEmptyFile(filePath, label) {
  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch {
    throw new Error(`Missing ${label}: ${filePath}`);
  }

  if (!fileStats.isFile() || fileStats.size === 0) {
    throw new Error(`${label} is not a non-empty file: ${filePath}`);
  }
  return fileStats.size;
}

async function sha1(filePath) {
  const hash = createHash('sha1');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex').toUpperCase();
}

const packageManifest = JSON.parse(
  await readFile(path.resolve('package.json'), 'utf8'),
);
const version = packageManifest.version;
if (typeof version !== 'string' || !/^\d+\.\d+\.\d+/.test(version)) {
  throw new Error(`Invalid package version: ${String(version)}`);
}

const makeDirectory = path.resolve(
  'out',
  'make',
  'squirrel.windows',
  'x64',
);
const setupPath = path.join(makeDirectory, 'FrameShot-Setup.exe');
const packageName = `frameshot-${version}-full.nupkg`;
const packagePath = path.join(makeDirectory, packageName);
const releasesPath = path.join(makeDirectory, 'RELEASES');

await assertNonEmptyFile(setupPath, 'Windows installer');
const packageSize = await assertNonEmptyFile(packagePath, 'full NuGet package');
await assertNonEmptyFile(releasesPath, 'Squirrel RELEASES manifest');

const releaseEntries = (await readFile(releasesPath, 'utf8'))
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const match = /^([A-Fa-f0-9]{40})\s+(\S+)\s+(\d+)$/.exec(line);
    if (!match) {
      throw new Error(`Invalid Squirrel RELEASES entry: ${line}`);
    }
    return {
      sha1: match[1].toUpperCase(),
      file: match[2],
      size: Number(match[3]),
    };
  });

const packageEntry = releaseEntries.find(
  (entry) => path.basename(entry.file) === packageName,
);
if (!packageEntry) {
  throw new Error(
    `Squirrel RELEASES does not reference ${packageName}: ${releasesPath}`,
  );
}

if (packageEntry.size !== packageSize) {
  throw new Error(
    `Squirrel RELEASES size mismatch for ${packageName}: expected ${packageSize}, got ${packageEntry.size}`,
  );
}

const packageSha1 = await sha1(packagePath);
if (packageEntry.sha1 !== packageSha1) {
  throw new Error(
    `Squirrel RELEASES SHA-1 mismatch for ${packageName}: expected ${packageSha1}, got ${packageEntry.sha1}`,
  );
}

console.log('Verified Windows Squirrel artifacts:');
console.log(`- installer: ${setupPath}`);
console.log(`- full package: ${packagePath}`);
console.log(`- RELEASES: ${releasesPath}`);
