import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const VERSION_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

async function readPackageVersion() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'));
  } catch (error) {
    throw new Error('Could not read package.json', { cause: error });
  }

  if (
    typeof manifest.version !== 'string' ||
    !VERSION_PATTERN.test(manifest.version)
  ) {
    throw new Error(
      `package.json version must be a canonical N.N.N version: ${String(manifest.version)}`,
    );
  }

  return manifest.version;
}

async function findPortableExecutable(outputDirectory, version) {
  let entries;
  try {
    entries = await readdir(outputDirectory, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Could not read portable output directory: ${outputDirectory}`, {
      cause: error,
    });
  }

  const executables = entries.filter(
    (entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.exe',
  );
  if (executables.length !== 1) {
    throw new Error(
      `Expected exactly one portable executable in ${outputDirectory}, found ${executables.length}: ${executables.map((entry) => entry.name).join(', ') || '(none)'}`,
    );
  }

  const expectedName = `FrameShot-${version}-Windows-x64-Portable.exe`;
  if (executables[0].name !== expectedName) {
    throw new Error(
      `Unexpected portable executable name: expected ${expectedName}, got ${executables[0].name}`,
    );
  }

  return path.join(outputDirectory, expectedName);
}

async function verifyPortableExecutable(executablePath) {
  const file = await open(executablePath, 'r');
  try {
    const fileStats = await file.stat();
    if (!fileStats.isFile() || fileStats.size === 0) {
      throw new Error(`Portable executable is not a non-empty file: ${executablePath}`);
    }

    const dosHeader = Buffer.alloc(64);
    const dosRead = await file.read(dosHeader, 0, dosHeader.length, 0);
    if (dosRead.bytesRead !== dosHeader.length) {
      throw new Error(`Portable executable has a truncated DOS header: ${executablePath}`);
    }
    if (dosHeader[0] !== 0x4d || dosHeader[1] !== 0x5a) {
      throw new Error(`Portable executable is missing the MZ signature: ${executablePath}`);
    }

    const peOffset = dosHeader.readUInt32LE(0x3c);
    if (peOffset > fileStats.size - 4) {
      throw new Error(`Portable executable has an invalid PE header offset: ${executablePath}`);
    }

    const peSignature = Buffer.alloc(4);
    const peRead = await file.read(peSignature, 0, peSignature.length, peOffset);
    if (
      peRead.bytesRead !== peSignature.length ||
      !peSignature.equals(Buffer.from([0x50, 0x45, 0x00, 0x00]))
    ) {
      throw new Error(`Portable executable is missing the PE signature: ${executablePath}`);
    }

    return fileStats.size;
  } finally {
    await file.close();
  }
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

const version = await readPackageVersion();
const outputDirectory = path.resolve('out', 'make', 'portable.windows', 'x64');
const executablePath = await findPortableExecutable(outputDirectory, version);
const size = await verifyPortableExecutable(executablePath);
const digest = await sha256(executablePath);

console.log('Verified Windows portable executable:');
console.log(`- file: ${executablePath}`);
console.log(`- size: ${size} bytes`);
console.log(`- SHA-256: ${digest}`);
