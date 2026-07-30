import path from 'node:path';
import { net, protocol, type Session } from 'electron';
import { pathToFileURL } from 'node:url';

export const APP_SCHEME = 'frameshot-app';
export const APP_HOST = 'app';
export const APP_ENTRY_URL = `${APP_SCHEME}://${APP_HOST}/index.html`;

const APP_CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
].join('; ');

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export function registerAppSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
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
}

export function resolveBundledRendererPath(
  rendererRoot: string,
  requestUrl: string,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== `${APP_SCHEME}:` ||
    parsed.hostname !== APP_HOST ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    return null;
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }

  if (pathname === '/') pathname = '/index.html';
  if (pathname.includes('\0')) return null;

  const root = path.resolve(rendererRoot);
  const candidate = path.resolve(root, `.${pathname}`);
  const relative = path.relative(root, candidate);
  if (
    !relative ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return candidate;
}

export function installAppProtocol(
  appSession: Session,
  rendererRoot: string,
): () => void {
  if (appSession.protocol.isProtocolHandled(APP_SCHEME)) {
    throw new Error(`${APP_SCHEME}: は既に登録されています。`);
  }

  appSession.protocol.handle(APP_SCHEME, async (request) => {
    if (request.method !== 'GET') {
      return textResponse('Method Not Allowed', 405);
    }

    const filePath = resolveBundledRendererPath(rendererRoot, request.url);
    if (!filePath) return textResponse('Not Found', 404);

    const fileResponse = await net
      .fetch(pathToFileURL(filePath).href)
      .catch(() => null);
    if (!fileResponse || !fileResponse.ok) {
      return textResponse('Not Found', 404);
    }

    const headers = new Headers(fileResponse.headers);
    headers.set('x-content-type-options', 'nosniff');
    headers.set('referrer-policy', 'no-referrer');
    if (path.basename(filePath) === 'index.html') {
      headers.set('content-security-policy', APP_CSP);
      headers.set('cache-control', 'no-store');
    }

    return new Response(fileResponse.body, {
      status: fileResponse.status,
      statusText: fileResponse.statusText,
      headers,
    });
  });

  return () => {
    if (appSession.protocol.isProtocolHandled(APP_SCHEME)) {
      appSession.protocol.unhandle(APP_SCHEME);
    }
  };
}
