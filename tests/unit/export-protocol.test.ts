import { describe, expect, it } from 'vitest';
import {
  ExportResourceStore,
  exportResourceUrls,
} from '../../src/main/export-protocol';

describe('ExportResourceStore', () => {
  it('serves the in-memory page image once without caching', async () => {
    const store = new ExportResourceStore();
    const pagePng = Uint8Array.from([137, 80, 78, 71]);
    const urls = store.create(pagePng);

    const image = store.handle(new Request(urls.pageImageUrl));
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(image.headers.get('cache-control')).toContain('no-store');
    expect(Array.from(new Uint8Array(await image.arrayBuffer()))).toEqual(
      Array.from(pagePng),
    );
    expect(store.handle(new Request(urls.pageImageUrl)).status).toBe(410);
  });

  it('requires an exact GET URL and removes resources explicitly', () => {
    const store = new ExportResourceStore();
    const urls = store.create(Uint8Array.from([1]));

    expect(
      store.handle(new Request(urls.pageImageUrl, { method: 'POST' })).status,
    ).toBe(405);
    expect(
      store.handle(new Request(`${urls.pageImageUrl}?unexpected=1`)).status,
    ).toBe(404);
    expect(
      store.handle(new Request(`${urls.pageImageUrl}/`)).status,
    ).toBe(404);
    expect(
      store.handle(
        new Request(urls.pageImageUrl.replace('//capture/', '//other/')),
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
