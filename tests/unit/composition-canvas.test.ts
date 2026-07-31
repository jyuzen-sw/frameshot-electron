import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { calculateCompositionLayout } from '@shared/layout';
import { DEFAULT_SETTINGS } from '@shared/presets';
import { CompositionCanvas } from '../../src/renderer/components/CompositionCanvas';

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
      expect(markup).toContain('class="composition-canvas background-soft"');
      expect(markup).toContain('class="composition-browser-frame composition-frame-shadow"');
      expect(markup).toContain('class="composition-browser-bar"');
      expect(markup).toContain('example.com');
    }
    expect(live).toContain('data-slot-mode="live"');
    expect(live).not.toContain('id="page-image"');
    expect(image).toContain('data-slot-mode="image"');
    expect(image).toContain('id="page-image"');
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
