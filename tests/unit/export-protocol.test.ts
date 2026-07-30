import { describe, expect, it } from 'vitest';
import {
  ExportResourceStore,
  exportResourceUrls,
} from '../../src/main/export-protocol';

describe('ExportResourceStore', () => {
  it('serves the document once and keeps the page image in memory', async () => {
    const store = new ExportResourceStore();
    const pagePng = Uint8Array.from([137, 80, 78, 71]);
    const urls = store.create(
      pagePng,
      ({ pageImageUrl }) => `<img src="${pageImageUrl}">`,
    );

    const firstDocument = store.handle(new Request(urls.documentUrl));
    expect(firstDocument.status).toBe(200);
    expect(await firstDocument.text()).toContain(urls.pageImageUrl);
    expect(firstDocument.headers.get('cache-control')).toContain('no-store');
    expect(firstDocument.headers.get('content-security-policy')).toContain(
      "default-src 'none'",
    );

    expect(
      store.handle(new Request(urls.documentUrl)).status,
    ).toBe(410);

    const image = store.handle(new Request(urls.pageImageUrl));
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(Array.from(new Uint8Array(await image.arrayBuffer()))).toEqual(
      Array.from(pagePng),
    );
  });

  it('requires an exact GET URL and removes every resource explicitly', () => {
    const store = new ExportResourceStore();
    const urls = store.create(Uint8Array.from([1]), () => '<main>capture</main>');

    expect(
      store.handle(new Request(urls.documentUrl, { method: 'POST' })).status,
    ).toBe(405);
    expect(
      store.handle(new Request(`${urls.documentUrl}?unexpected=1`)).status,
    ).toBe(404);
    expect(
      store.handle(new Request(`${urls.documentUrl}/`)).status,
    ).toBe(404);
    expect(
      store.handle(
        new Request(urls.documentUrl.replace('//capture/', '//other/')),
      ).status,
    ).toBe(404);

    store.remove(urls.token);
    expect(store.handle(new Request(urls.pageImageUrl)).status).toBe(404);
  });

  it('rejects malformed resource tokens', () => {
    expect(() => exportResourceUrls('not-a-token')).toThrow(
      '書き出し用トークンが不正',
    );
  });
});
