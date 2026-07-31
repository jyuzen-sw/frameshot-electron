import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateCompositionLayout } from '@shared/layout';
import { DEFAULT_SETTINGS } from '@shared/presets';
import { CompositionCanvas } from '../../src/renderer/components/CompositionCanvas';

function canvasOpeningTag(markup: string): string {
  const tag = markup.match(/<div class="composition-canvas[^>]*>/)?.[0];
  if (!tag) throw new Error('Composition canvas was not rendered.');
  return tag;
}

function artboardOpeningTag(markup: string): string {
  const tag = markup.match(/<div class="composition-artboard[^>]*>/)?.[0];
  if (!tag) throw new Error('Composition artboard was not rendered.');
  return tag;
}

describe('CompositionCanvas', () => {
  it('uses the same browser-frame markup for live and image slots', () => {
    const live = renderToStaticMarkup(
      createElement(CompositionCanvas, {
        settings: DEFAULT_SETTINGS,
        pageUrl: 'https://example.com/dashboard',
        slotMode: 'live',
      }),
    );
    const image = renderToStaticMarkup(
      createElement(CompositionCanvas, {
        settings: DEFAULT_SETTINGS,
        pageUrl: 'https://example.com/dashboard',
        slotMode: 'image',
        pageImageUrl:
          'frameshot-export://capture/00000000-0000-4000-8000-000000000000/page.png',
      }),
    );

    for (const markup of [live, image]) {
      expect(markup).toContain('class="composition-canvas"');
      expect(markup).toContain('class="composition-artboard background-soft"');
      expect(markup).toContain('class="composition-browser-frame composition-frame-shadow"');
      expect(markup).toContain('class="composition-browser-bar"');
      expect(markup).toContain('example.com');
    }
    expect(live).toContain('data-slot-mode="live"');
    expect(live).not.toContain('id="page-image"');
    expect(image).toContain('data-slot-mode="image"');
    expect(image).toContain('id="page-image"');
  });

  it('uses the same fluid background for live preview and exported image', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      gradientFrom: '#d9f2ec',
      gradientTo: '#dce7fb',
      gradientAngle: 128,
      backgroundStyle: 'fluid' as const,
    };
    const live = renderToStaticMarkup(
      createElement(CompositionCanvas, {
        settings,
        pageUrl: 'https://example.com/dashboard',
        slotMode: 'live',
      }),
    );
    const image = renderToStaticMarkup(
      createElement(CompositionCanvas, {
        settings,
        pageUrl: 'https://example.com/dashboard',
        slotMode: 'image',
        pageImageUrl:
          'frameshot-export://capture/00000000-0000-4000-8000-000000000000/page.png',
      }),
    );

    expect(canvasOpeningTag(live)).toBe(canvasOpeningTag(image));
    expect(artboardOpeningTag(live)).toBe(artboardOpeningTag(image));
    expect(artboardOpeningTag(live)).toContain(
      'class="composition-artboard background-fluid"',
    );
    expect(artboardOpeningTag(live)).toContain('--background-angle:128deg');
    expect(artboardOpeningTag(live)).toContain('--background-from:#d9f2ec');
    expect(artboardOpeningTag(live)).toContain('--background-to:#dce7fb');
  });

  it('keeps the outer canvas black and clips effects inside the artboard', () => {
    const layout = calculateCompositionLayout(DEFAULT_SETTINGS);
    const markup = renderToStaticMarkup(
      createElement(CompositionCanvas, {
        settings: DEFAULT_SETTINGS,
        pageUrl: 'https://example.com',
        slotMode: 'live',
      }),
    );
    const stylesheet = readFileSync(
      new URL('../../src/renderer/styles.css', import.meta.url),
      'utf8',
    );

    expect(canvasOpeningTag(markup)).not.toContain('background-soft');
    expect(artboardOpeningTag(markup)).toContain(
      `left:${layout.artboard.x}px`,
    );
    expect(artboardOpeningTag(markup)).toContain(
      `data-artboard-width="${layout.artboard.width}"`,
    );
    expect(markup).toContain(
      `left:${(layout.frame.x - layout.artboard.x).toFixed(3)}px`,
    );
    expect(stylesheet).toMatch(
      /\.composition-canvas\s*\{[^}]*background:\s*#000;/s,
    );
    expect(stylesheet).toMatch(
      /\.composition-artboard\s*\{[^}]*overflow:\s*hidden;/s,
    );
  });

  it.each([
    ['settings', '設定を編集中'],
    ['viewport-menu', '表示サイズを選択中'],
  ] as const)(
    'shows a dedicated placeholder while suspended by %s',
    (pageSuspensionReason, heading) => {
    const markup = renderToStaticMarkup(
      createElement(CompositionCanvas, {
        settings: DEFAULT_SETTINGS,
        pageUrl: 'https://example.com/dashboard',
        pageSuspensionReason,
        slotMode: 'live',
      }),
    );

    expect(markup).toContain('is-suspended');
    expect(markup).toContain(heading);
    expect(markup).toContain('ライブページは一時的に非表示です');
    expect(markup).not.toContain('target-loading-placeholder');
    },
  );

  it('does not render the retired live canvas footer', () => {
    const liveCanvasSource = readFileSync(
      new URL('../../src/renderer/components/LiveCanvas.tsx', import.meta.url),
      'utf8',
    );
    const stylesheet = readFileSync(
      new URL('../../src/renderer/styles.css', import.meta.url),
      'utf8',
    );

    expect(liveCanvasSource).not.toContain('canvas-caption');
    expect(liveCanvasSource).not.toContain('LIVE ·');
    expect(stylesheet).not.toContain('.canvas-caption');
  });

  it('uses shared layout values for the browser address', () => {
    const layout = calculateCompositionLayout(DEFAULT_SETTINGS);
    const markup = renderToStaticMarkup(
      createElement(CompositionCanvas, {
        settings: DEFAULT_SETTINGS,
        pageUrl: 'https://example.com/dashboard',
        slotMode: 'live',
      }),
    );

    expect(markup).toContain(
      `height:${layout.browserAddressHeight.toFixed(3)}px`,
    );
  });

  it.each(['browser', 'phone', 'tablet', 'none'] as const)(
    'renders the %s frame around the same page slot',
    (frameStyle) => {
      const markup = renderToStaticMarkup(
        createElement(CompositionCanvas, {
          settings: { ...DEFAULT_SETTINGS, frameStyle },
          pageUrl: 'https://example.com',
          slotMode: 'image',
          pageImageUrl:
            'frameshot-export://capture/00000000-0000-4000-8000-000000000000/page.png',
        }),
      );

      expect(markup).toContain(`data-frame-style="${frameStyle}"`);
      expect(markup).toContain('class="composition-page-slot');
      expect(markup).toContain('id="page-image"');
    },
  );

  it('renders an iPad-style camera without phone-only chrome', () => {
    const markup = renderToStaticMarkup(
      createElement(CompositionCanvas, {
        settings: {
          ...DEFAULT_SETTINGS,
          deviceMode: 'mobile',
          frameStyle: 'tablet',
          viewportWidth: 768,
          viewportHeight: 1024,
        },
        pageUrl: 'https://example.com',
        slotMode: 'live',
      }),
    );

    expect(markup).toContain('class="composition-tablet-frame');
    expect(markup).toContain('class="composition-tablet-camera"');
    expect(markup).not.toContain('composition-phone-island');
    expect(markup).not.toContain('composition-phone-home');
  });
});
