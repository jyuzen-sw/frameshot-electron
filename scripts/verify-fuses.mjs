import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  FuseState,
  FuseV1Options,
  FuseVersion,
  getCurrentFuseWire,
} from '@electron/fuses';

const EXPECTED_FUSES = new Map([
  [FuseV1Options.RunAsNode, FuseState.DISABLE],
  [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
  [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
  [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, FuseState.DISABLE],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, FuseState.DISABLE],
  [FuseV1Options.WasmTrapHandlers, FuseState.ENABLE],
]);

const STATE_NAMES = new Map([
  [FuseState.DISABLE, 'disabled'],
  [FuseState.ENABLE, 'enabled'],
  [FuseState.REMOVED, 'removed'],
  [FuseState.INHERIT, 'inherited'],
]);

async function isFile(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findPackagedElectronBinary(outDirectory) {
  const expectedDirectoryName = `FrameShot-${process.platform}-${process.arch}`;
  const packageDirectories = (await readdir(outDirectory, {
    withFileTypes: true,
  }))
    .filter(
      (entry) =>
        entry.isDirectory() && entry.name === expectedDirectoryName,
    )
    .map((entry) => path.join(outDirectory, entry.name));

  const candidates = [];
  for (const packageDirectory of packageDirectories) {
    if (packageDirectory.includes('-darwin-')) {
      const macOSDirectory = path.join(
        packageDirectory,
        'FrameShot.app',
        'Contents',
        'MacOS',
      );
      try {
        for (const entry of await readdir(macOSDirectory, {
          withFileTypes: true,
        })) {
          if (entry.isFile()) {
            candidates.push(path.join(macOSDirectory, entry.name));
          }
        }
      } catch {
        // The missing bundle is reported by the common no-candidate error below.
      }
      continue;
    }

    const executableName = packageDirectory.includes('-win32-')
      ? 'frameshot.exe'
      : 'frameshot';
    const executablePath = path.join(packageDirectory, executableName);
    if (await isFile(executablePath)) {
      candidates.push(executablePath);
    }
  }

  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one packaged FrameShot executable under ${path.join(outDirectory, expectedDirectoryName)}, found ${candidates.length}: ${candidates.join(', ') || '(none)'}`,
    );
  }

  return candidates[0];
}

async function verifyFuses(executablePath) {
  const actual = await getCurrentFuseWire(executablePath);

  if (actual.version !== FuseVersion.V1) {
    throw new Error(
      `Unexpected fuse version for ${executablePath}: ${actual.version}`,
    );
  }

  const errors = [];
  for (const [option, expectedState] of EXPECTED_FUSES) {
    const actualState = actual[option];
    if (actualState !== expectedState) {
      errors.push(
        `${FuseV1Options[option]}: expected ${STATE_NAMES.get(expectedState)}, got ${STATE_NAMES.get(actualState) ?? actualState}`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Fuse verification failed for ${executablePath}:\n${errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }

  console.log(`Verified all security fuses: ${executablePath}`);
}

const explicitExecutable = process.argv[2];
const executablePath = explicitExecutable
  ? path.resolve(explicitExecutable)
  : await findPackagedElectronBinary(path.resolve('out'));

await verifyFuses(executablePath);
