import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => ({
  registerSchemesAsPrivileged: vi.fn(),
}));

vi.mock('electron', () => ({
  dialog: {},
  net: {},
  protocol: {
    registerSchemesAsPrivileged:
      electronMocks.registerSchemesAsPrivileged,
  },
}));

import {
  APP_ENTRY_URL,
  EXPORT_RENDERER_HASH,
  registerAppSchemePrivileges,
  resolveBundledRendererPath,
} from '../../src/main/app-protocol';
import { registerExportSchemePrivileges } from '../../src/main/export-protocol';
import {
  normalizeTrustedRendererUrl,
  parseExternalHttpUrl,
} from '../../src/main/main-window-security';

describe('bundled renderer protocol policy', () => {
  const rendererRoot = path.resolve('/application/renderer');

  it('registers a secure standard scheme without CSP bypass or services', () => {
    electronMocks.registerSchemesAsPrivileged.mockClear();
    registerAppSchemePrivileges();

    expect(electronMocks.registerSchemesAsPrivileged).toHaveBeenCalledWith([
      {
        scheme: 'frameshot-app',
        privileges: {
          standard: true,
          secure: true,
          bypassCSP: false,
          allowServiceWorkers: false,
          supportFetchAPI: true,
          corsEnabled: false,
          stream: false,
        },
      },
    ]);
  });

  it('resolves only files below the renderer bundle', () => {
    expect(
      resolveBundledRendererPath(rendererRoot, APP_ENTRY_URL),
    ).toBe(path.join(rendererRoot, 'index.html'));
    expect(
      resolveBundledRendererPath(
        rendererRoot,
        `${APP_ENTRY_URL}${EXPORT_RENDERER_HASH}`,
      ),
    ).toBe(path.join(rendererRoot, 'index.html'));
    expect(
      resolveBundledRendererPath(
        rendererRoot,
        'frameshot-app://app/assets/index-abcd.js',
      ),
    ).toBe(path.join(rendererRoot, 'assets/index-abcd.js'));
  });

  it('rejects another host, query strings, and encoded traversal', () => {
    expect(
      resolveBundledRendererPath(
        rendererRoot,
        'frameshot-app://attacker/index.html',
      ),
    ).toBeNull();
    expect(
      resolveBundledRendererPath(
        rendererRoot,
        'frameshot-app://app/index.html?redirect=https://example.com',
      ),
    ).toBeNull();
    expect(
      resolveBundledRendererPath(
        rendererRoot,
        'frameshot-app://app/%2e%2e%2fsecret.txt',
      ),
    ).toBeNull();
  });
});

describe('export image protocol policy', () => {
  it('registers a secure standard scheme without CSP bypass or web APIs', () => {
    electronMocks.registerSchemesAsPrivileged.mockClear();
    registerExportSchemePrivileges();

    expect(electronMocks.registerSchemesAsPrivileged).toHaveBeenCalledWith([
      {
        scheme: 'frameshot-export',
        privileges: {
          standard: true,
          secure: true,
          bypassCSP: false,
          allowServiceWorkers: false,
          supportFetchAPI: false,
          corsEnabled: false,
          stream: false,
        },
      },
    ]);
  });
});

describe('main-window navigation policy', () => {
  it('accepts credential-free HTTP(S) URLs', () => {
    expect(parseExternalHttpUrl('https://example.com/path')?.href).toBe(
      'https://example.com/path',
    );
    expect(parseExternalHttpUrl('http://localhost:4321/')?.hostname).toBe(
      'localhost',
    );
  });

  it('rejects credentials and non-web protocols', () => {
    expect(
      parseExternalHttpUrl('https://user:secret@example.com/'),
    ).toBeNull();
    expect(parseExternalHttpUrl('javascript:alert(1)')).toBeNull();
    expect(parseExternalHttpUrl('file:///tmp/example.html')).toBeNull();
  });

  it('normalizes the immutable renderer URL', () => {
    expect(normalizeTrustedRendererUrl('http://localhost:5173')).toBe(
      'http://localhost:5173/',
    );
  });
});
