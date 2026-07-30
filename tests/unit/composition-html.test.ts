import { describe, expect, it } from 'vitest';
import { buildCompositionHtml } from '../../src/main/composition-html';
import { calculateCompositionLayout } from '@shared/layout';
import { DEFAULT_SETTINGS } from '@shared/presets';

describe('buildCompositionHtml', () => {
  it('references the in-memory page resource without embedding image data', () => {
    const pageImageUrl =
      'frameshot-export://capture/00000000-0000-4000-8000-000000000000/page.png';
    const html = buildCompositionHtml({
      settings: DEFAULT_SETTINGS,
      pageImageUrl,
      targetUrl: 'https://example.com/dashboard',
    });

    expect(html).toContain(`src="${pageImageUrl}"`);
    expect(html).not.toContain('data:image');
    expect(html).not.toContain('<script');
    expect(html).toContain("script-src 'none'");
  });

  it('uses the shared vertically-centered browser address height', () => {
    const layout = calculateCompositionLayout(DEFAULT_SETTINGS);
    const html = buildCompositionHtml({
      settings: DEFAULT_SETTINGS,
      pageImageUrl:
        'frameshot-export://capture/00000000-0000-4000-8000-000000000000/page.png',
      targetUrl: 'https://example.com/dashboard',
    });

    expect(html).toContain(
      `height:${layout.browserAddressHeight.toFixed(3)}px;`,
    );
    expect(html).toContain('align-self:center;');
    expect(html).toContain('line-height:1;');
    expect(html).not.toMatch(/\.address-chip\s*\{[^}]*min-height/s);
  });
});
