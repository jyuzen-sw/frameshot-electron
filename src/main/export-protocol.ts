import { randomUUID } from 'node:crypto';
import { protocol, type Session } from 'electron';

export const EXPORT_SCHEME = 'frameshot-export';
export const EXPORT_PARTITION = 'frameshot-export';

const EXPORT_HOST = 'capture';
const TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ExportResource {
  pagePng: Uint8Array<ArrayBuffer> | null;
}

export interface ExportResourceUrls {
  token: string;
  pageImageUrl: string;
}

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function response(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export function exportResourceUrls(token: string): ExportResourceUrls {
  if (!TOKEN_PATTERN.test(token)) {
    throw new Error('書き出し用トークンが不正です。');
  }
  const baseUrl = `${EXPORT_SCHEME}://${EXPORT_HOST}/${token}`;
  return {
    token,
    pageImageUrl: `${baseUrl}/page.png`,
  };
}

export function registerExportSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: EXPORT_SCHEME,
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
}

export class ExportResourceStore {
  private readonly resources = new Map<string, ExportResource>();

  public create(pagePng: Uint8Array): ExportResourceUrls {
    const urls = exportResourceUrls(randomUUID());
    this.resources.set(urls.token, {
      pagePng: Uint8Array.from(pagePng),
    });
    return urls;
  }

  public remove(token: string): void {
    this.resources.delete(token);
  }

  public clear(): void {
    this.resources.clear();
  }

  public handle(request: Request): Response {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { ...NO_STORE_HEADERS, Allow: 'GET' },
      });
    }

    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return response(404, 'Not Found');
    }

    if (
      url.protocol !== `${EXPORT_SCHEME}:` ||
      url.hostname !== EXPORT_HOST ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      return response(404, 'Not Found');
    }

    const pathParts = url.pathname.split('/');
    if (
      pathParts.length !== 3 ||
      pathParts[0] !== '' ||
      !TOKEN_PATTERN.test(pathParts[1] ?? '')
    ) {
      return response(404, 'Not Found');
    }

    const [, token, resourceName] = pathParts;
    const resource = this.resources.get(token);
    if (!resource) {
      return response(404, 'Not Found');
    }

    if (resourceName === 'page.png') {
      if (resource.pagePng === null) {
        return response(410, 'Gone');
      }
      const pagePng = resource.pagePng;
      resource.pagePng = null;
      return new Response(pagePng.slice(), {
        status: 200,
        headers: {
          ...NO_STORE_HEADERS,
          'Content-Type': 'image/png',
        },
      });
    }

    return response(404, 'Not Found');
  }
}

export function installExportProtocol(
  exportSession: Session,
  resources: ExportResourceStore,
): () => void {
  if (exportSession.protocol.isProtocolHandled(EXPORT_SCHEME)) {
    throw new Error('書き出し用プロトコルはすでに登録されています。');
  }

  const denyDownload = (event: Electron.Event): void => {
    event.preventDefault();
  };

  exportSession.setPermissionCheckHandler(() => false);
  exportSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  exportSession.on('will-download', denyDownload);
  exportSession.protocol.handle(EXPORT_SCHEME, (request) =>
    resources.handle(request),
  );

  return () => {
    if (exportSession.protocol.isProtocolHandled(EXPORT_SCHEME)) {
      exportSession.protocol.unhandle(EXPORT_SCHEME);
    }
    exportSession.removeListener('will-download', denyDownload);
    exportSession.setPermissionCheckHandler(null);
    exportSession.setPermissionRequestHandler(null);
    resources.clear();
  };
}
