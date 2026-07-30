import { calculateCompositionLayout, shadowCss } from '@shared/layout';
import { formatUrlForFrame } from '@shared/url';
import type { CaptureSettings } from '@shared/types';

interface CompositionHtmlInput {
  settings: CaptureSettings;
  pageImageUrl: string;
  targetUrl: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function px(value: number): string {
  return `${value.toFixed(3)}px`;
}

export function buildCompositionHtml({
  settings,
  pageImageUrl,
  targetUrl,
}: CompositionHtmlInput): string {
  const layout = calculateCompositionLayout(settings);
  const safeUrl = escapeHtml(formatUrlForFrame(targetUrl));
  const frameShadow = shadowCss(settings.shadow);
  const glowOpacity = settings.backgroundStyle === 'soft' ? 0.72 : 0.26;
  const grainOpacity = settings.backgroundStyle === 'soft' ? 0.08 : 0.035;
  const fontSize = Math.max(10, Math.min(16, 13 * layout.scale));

  let frameMarkup = '';

  if (settings.frameStyle === 'browser') {
    const barHeight = layout.browserBarHeight;
    const dotSize = Math.max(7, 11 * layout.scale);
    const dotGap = Math.max(5, 8 * layout.scale);
    const barPadding = Math.max(10, 18 * layout.scale);
    frameMarkup = `
      <section class="browser-frame frame-shadow" style="
        left:${px(layout.frame.x)};
        top:${px(layout.frame.y)};
        width:${px(layout.frame.width)};
        height:${px(layout.frame.height)};
        border-radius:${px(layout.frame.radius)};
      ">
        <header class="browser-bar" style="height:${px(barHeight)};padding:0 ${px(barPadding)};">
          <div class="traffic" style="gap:${px(dotGap)};">
            <span style="width:${px(dotSize)};height:${px(dotSize)};background:#ff6b6b"></span>
            <span style="width:${px(dotSize)};height:${px(dotSize)};background:#ffd166"></span>
            <span style="width:${px(dotSize)};height:${px(dotSize)};background:#5dd39e"></span>
          </div>
          <div class="address-chip" style="
            height:${px(layout.browserAddressHeight)};
            align-self:center;
            line-height:1;
            font-size:${px(fontSize)};
          ">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1.2A1.8 1.8 0 0 1 20 11.8v7.4a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 19.2v-7.4A1.8 1.8 0 0 1 5.8 10H7Zm2 0h6V8a3 3 0 0 0-6 0v2Z"/></svg>
            <span>${settings.showUrl ? safeUrl : 'Captured page'}</span>
          </div>
          <div class="browser-actions"><span></span><span></span><span></span></div>
        </header>
        <div class="browser-screen" style="
          left:0;
          top:${px(barHeight)};
          width:${px(layout.screen.width)};
          height:${px(layout.screen.height)};
        ">
          <img id="page-image" src="${escapeHtml(pageImageUrl)}" alt="Captured page" />
        </div>
      </section>`;
  } else if (settings.frameStyle === 'phone') {
    const islandWidth = Math.min(layout.screen.width * 0.34, 126 * layout.scale);
    const islandHeight = Math.max(12, 28 * layout.scale);
    frameMarkup = `
      <section class="phone-frame frame-shadow" style="
        left:${px(layout.frame.x)};
        top:${px(layout.frame.y)};
        width:${px(layout.frame.width)};
        height:${px(layout.frame.height)};
        border-radius:${px(layout.frame.radius)};
      ">
        <div class="phone-highlight"></div>
        <div class="phone-island" style="
          width:${px(islandWidth)};
          height:${px(islandHeight)};
          top:${px(Math.max(10, layout.phoneBezel.top * 0.34))};
        "><span></span></div>
        <div class="phone-screen" style="
          left:${px(layout.phoneBezel.left)};
          top:${px(layout.phoneBezel.top)};
          width:${px(layout.screen.width)};
          height:${px(layout.screen.height)};
          border-radius:${px(layout.screen.radius)};
        ">
          <img id="page-image" src="${escapeHtml(pageImageUrl)}" alt="Captured page" />
        </div>
        <div class="phone-home" style="bottom:${px(Math.max(9, layout.phoneBezel.bottom * 0.38))};width:${px(Math.min(layout.screen.width * 0.32, 116 * layout.scale))}"></div>
      </section>`;
  } else {
    frameMarkup = `
      <section class="plain-frame frame-shadow" style="
        left:${px(layout.frame.x)};
        top:${px(layout.frame.y)};
        width:${px(layout.frame.width)};
        height:${px(layout.frame.height)};
        border-radius:${px(layout.frame.radius)};
      ">
        <img id="page-image" src="${escapeHtml(pageImageUrl)}" alt="Captured page" />
      </section>`;
  }

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src frameshot-export:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin:0; width:100%; height:100%; overflow:hidden; }
    body {
      position:relative;
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif;
      background:linear-gradient(${settings.gradientAngle}deg, ${settings.gradientFrom} 0%, ${settings.gradientTo} 100%);
      isolation:isolate;
    }
    body::before, body::after {
      content:"";
      position:absolute;
      border-radius:999px;
      filter:blur(1px);
      pointer-events:none;
      z-index:-2;
      opacity:${glowOpacity};
    }
    body::before {
      width:58vmax;
      height:58vmax;
      left:-20vmax;
      top:-28vmax;
      background:radial-gradient(circle, rgba(255,255,255,.82) 0%, rgba(255,255,255,0) 68%);
    }
    body::after {
      width:52vmax;
      height:52vmax;
      right:-18vmax;
      bottom:-30vmax;
      background:radial-gradient(circle, rgba(255,255,255,.74) 0%, rgba(255,255,255,0) 70%);
    }
    .grain {
      position:absolute;
      inset:0;
      z-index:-1;
      opacity:${grainOpacity};
      background-image:
        radial-gradient(circle at 20% 20%, rgba(15,23,42,.22) 0 .55px, transparent .7px),
        radial-gradient(circle at 80% 65%, rgba(255,255,255,.9) 0 .55px, transparent .7px);
      background-size:5px 5px, 7px 7px;
      mix-blend-mode:soft-light;
    }
    .frame-shadow { position:absolute; box-shadow:${frameShadow}; }
    #page-image { display:block; width:100%; height:100%; object-fit:fill; user-select:none; }
    .browser-frame {
      overflow:hidden;
      background:#f8fafc;
      border:1px solid rgba(255,255,255,.78);
      outline:1px solid rgba(15,23,42,.07);
    }
    .browser-bar {
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto;
      align-items:center;
      gap:18px;
      background:linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,250,252,.96));
      border-bottom:1px solid rgba(15,23,42,.08);
    }
    .traffic { display:flex; align-items:center; }
    .traffic span { display:block; border-radius:999px; box-shadow:inset 0 0 0 1px rgba(15,23,42,.08); }
    .address-chip {
      justify-self:center;
      width:min(72%, 760px);
      display:flex;
      align-items:center;
      justify-content:center;
      gap:.55em;
      padding:0 1.1em;
      color:#64748b;
      background:rgba(226,232,240,.62);
      border:1px solid rgba(148,163,184,.18);
      border-radius:999px;
      overflow:hidden;
      white-space:nowrap;
    }
    .address-chip svg { width:1.08em; height:1.08em; fill:#94a3b8; flex:none; }
    .address-chip span { overflow:hidden; text-overflow:ellipsis; }
    .browser-actions { display:flex; gap:5px; align-items:center; }
    .browser-actions span { width:3px; height:3px; border-radius:50%; background:#94a3b8; }
    .browser-screen { position:absolute; overflow:hidden; background:white; }
    .phone-frame {
      overflow:hidden;
      background:linear-gradient(145deg, #242832 0%, #090b10 50%, #1b1e27 100%);
      border:1px solid rgba(255,255,255,.32);
      outline:1px solid rgba(0,0,0,.7);
    }
    .phone-highlight {
      position:absolute;
      inset:1px;
      border-radius:inherit;
      border:1px solid rgba(255,255,255,.16);
      pointer-events:none;
    }
    .phone-screen { position:absolute; overflow:hidden; background:#fff; }
    .phone-island {
      position:absolute;
      left:50%;
      transform:translateX(-50%);
      border-radius:999px;
      background:#020308;
      z-index:3;
      box-shadow:inset 0 1px 1px rgba(255,255,255,.08);
    }
    .phone-island span {
      position:absolute;
      right:13%;
      top:50%;
      width:8%;
      aspect-ratio:1;
      transform:translateY(-50%);
      border-radius:50%;
      background:radial-gradient(circle at 35% 35%, #334155, #020617 72%);
    }
    .phone-home {
      position:absolute;
      left:50%;
      transform:translateX(-50%);
      height:4px;
      min-height:3px;
      border-radius:999px;
      background:rgba(255,255,255,.82);
    }
    .plain-frame { overflow:hidden; background:#fff; outline:1px solid rgba(15,23,42,.06); }
  </style>
</head>
<body>
  <div class="grain"></div>
  ${frameMarkup}
</body>
</html>`;
}
