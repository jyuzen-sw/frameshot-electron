import { useEffect, useRef, type Ref } from 'react';
import { calculateCompositionLayout } from '@shared/layout';
import { GRADIENT_PRESETS } from '@shared/presets';
import type {
  CaptureSettings,
  FrameStyle,
} from '@shared/types';
import {
  AlertIcon,
  CheckIcon,
  MonitorIcon,
  PhoneIcon,
  SlidersIcon,
  SparklesIcon,
  TrashIcon,
  WrenchIcon,
  XIcon,
} from './Icons';
import {
  backgroundClassName,
  gradientPresetCssProperties,
  isGradientPresetActive,
} from '../background';

interface SettingsPanelProps {
  settings: CaptureSettings;
  currentHost: string | null;
  certificateAllowed: boolean;
  focusViewportRequest: number;
  onClose: () => void;
  onSettingsChange: React.Dispatch<React.SetStateAction<CaptureSettings>>;
  onCertificateAllowed: (allowed: boolean) => void;
  onResetSession: () => void;
  onOpenDevTools: () => void;
}

interface NumberFieldProps {
  label: string;
  ariaLabel?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (value: number) => void;
}

function NumberField({
  label,
  ariaLabel,
  value,
  min,
  max,
  step = 1,
  suffix,
  inputRef,
  onChange,
}: NumberFieldProps): React.JSX.Element {
  return (
    <label className="number-field">
      <span>{label}</span>
      <span className="number-input-wrap">
        <input
          ref={inputRef}
          aria-label={ariaLabel}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(next);
          }}
        />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  );
}

interface RangeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}

function RangeField({ label, value, min, max, suffix = '', onChange }: RangeFieldProps): React.JSX.Element {
  return (
    <label className="range-field">
      <span><b>{label}</b><output>{value}{suffix}</output></span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Toggle({
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <label className={`toggle-row ${disabled ? 'disabled' : ''}`}>
      <span><b>{label}</b>{description && <small>{description}</small>}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}

export function SettingsPanel({
  settings,
  currentHost,
  certificateAllowed,
  focusViewportRequest,
  onClose,
  onSettingsChange,
  onCertificateAllowed,
  onResetSession,
  onOpenDevTools,
}: SettingsPanelProps): React.JSX.Element {
  const viewportWidthRef = useRef<HTMLInputElement>(null);
  const plannedExport = calculateCompositionLayout(settings).artboard;

  useEffect(() => {
    if (focusViewportRequest === 0) return;
    viewportWidthRef.current?.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    });
    viewportWidthRef.current?.focus({ preventScroll: true });
    viewportWidthRef.current?.select();
  }, [focusViewportRequest]);

  const patch = <K extends keyof CaptureSettings>(
    key: K,
    value: CaptureSettings[K],
  ) => onSettingsChange((current) => ({ ...current, [key]: value }));

  const setFrame = (frameStyle: FrameStyle) => {
    onSettingsChange((current) => ({
      ...current,
      frameStyle,
      showUrl: frameStyle === 'browser' ? current.showUrl : false,
    }));
  };

  return (
    <aside id="settings-panel" className="settings-panel">
      <div className="settings-heading">
        <span><SlidersIcon /></span>
        <div><strong>Studio settings</strong><small>構図と書き出し</small></div>
        <button
          type="button"
          className="settings-close-button"
          aria-label="詳細設定を閉じる"
          onClick={onClose}
        >
          <XIcon />
        </button>
      </div>

      <div className="settings-scroll">
        <section className="settings-section">
          <header><span>01</span><div><strong>サイズ</strong><small>出力画像とWebページの表示領域</small></div></header>
          <div className="subheading"><span>構図キャンバス（最大範囲）</span><em>MAX</em></div>
          <div className="two-column-fields">
            <NumberField label="幅" value={settings.outputWidth} min={320} max={7680} suffix="px" onChange={(value) => patch('outputWidth', value)} />
            <NumberField label="高さ" value={settings.outputHeight} min={320} max={7680} suffix="px" onChange={(value) => patch('outputHeight', value)} />
          </div>
          <div className="quick-size-row">
            {[
              ['16:9', 1920, 1080],
              ['4:5', 1080, 1350],
              ['1:1', 1600, 1600],
              ['OGP', 1200, 630],
            ].map(([label, width, height]) => (
              <button type="button" key={String(label)} onClick={() => onSettingsChange((current) => ({ ...current, outputWidth: Number(width), outputHeight: Number(height) }))}>{label}</button>
            ))}
          </div>
          <output className="planned-export-size">
            書き出し予定 {plannedExport.width} × {plannedExport.height}
          </output>

          <div className="subheading"><span>ページ表示領域</span><em>{settings.deviceMode}</em></div>
          <div className="two-column-fields">
            <NumberField inputRef={viewportWidthRef} ariaLabel="ページ表示領域 幅" label="幅" value={settings.viewportWidth} min={240} max={3840} suffix="px" onChange={(value) => patch('viewportWidth', value)} />
            <NumberField ariaLabel="ページ表示領域 高さ" label="高さ" value={settings.viewportHeight} min={240} max={3840} suffix="px" onChange={(value) => patch('viewportHeight', value)} />
          </div>
        </section>

        <section className="settings-section">
          <header><span>02</span><div><strong>フレーム</strong><small>ブラウザ・スマホ・タブレット・枠なし</small></div></header>
          <div className="frame-selector">
            <button type="button" aria-pressed={settings.frameStyle === 'browser'} className={settings.frameStyle === 'browser' ? 'active' : ''} onClick={() => setFrame('browser')}><MonitorIcon /><span>Browser</span></button>
            <button type="button" aria-pressed={settings.frameStyle === 'phone'} className={settings.frameStyle === 'phone' ? 'active' : ''} onClick={() => setFrame('phone')}><PhoneIcon /><span>Phone</span></button>
            <button type="button" aria-pressed={settings.frameStyle === 'tablet'} className={settings.frameStyle === 'tablet' ? 'active' : ''} onClick={() => setFrame('tablet')}><span className="frame-tablet-icon" aria-hidden="true" /><span>Tablet</span></button>
            <button type="button" aria-pressed={settings.frameStyle === 'none'} className={settings.frameStyle === 'none' ? 'active' : ''} onClick={() => setFrame('none')}><span className="frame-none-icon">□</span><span>None</span></button>
          </div>
          <RangeField label="背景とフレームの余白" value={settings.margin} min={0} max={420} suffix="px" onChange={(value) => patch('margin', value)} />
          <RangeField label="角丸" value={settings.cornerRadius} min={0} max={80} suffix="px" onChange={(value) => patch('cornerRadius', value)} />
          <RangeField label="影の強さ" value={settings.shadow} min={0} max={100} suffix="%" onChange={(value) => patch('shadow', value)} />
          {settings.frameStyle === 'browser' && (
            <Toggle label="アドレスを表示" description="ブラウザ枠内にホスト名を表示" checked={settings.showUrl} onChange={(value) => patch('showUrl', value)} />
          )}
        </section>

        <section className="settings-section">
          <header><span>03</span><div><strong>背景色</strong><small>淡色プリセットまたは2色を選んで調整</small></div></header>
          <div className="subheading"><span>背景グラデーション</span><em>COLOR</em></div>
          <div className="gradient-grid">
            {GRADIENT_PRESETS.map((gradient) => {
              const active = isGradientPresetActive(settings, gradient);
              return (
                <button
                  type="button"
                  key={gradient.id}
                  className={`gradient-swatch ${backgroundClassName(gradient.backgroundStyle)} ${active ? 'active' : ''}`}
                  aria-label={gradient.name}
                  aria-pressed={active}
                  title={gradient.name}
                  style={gradientPresetCssProperties(gradient)}
                  onClick={() => onSettingsChange((current) => ({
                    ...current,
                    gradientFrom: gradient.from,
                    gradientTo: gradient.to,
                    gradientAngle: gradient.angle,
                    backgroundStyle: gradient.backgroundStyle,
                  }))}
                >{active && <CheckIcon />}</button>
              );
            })}
          </div>
          <div className="color-fields">
            <label><span>カラー1</span><input type="color" aria-label="背景色 カラー1" value={settings.gradientFrom} onChange={(event) => patch('gradientFrom', event.target.value)} /><code>{settings.gradientFrom}</code></label>
            <label><span>カラー2</span><input type="color" aria-label="背景色 カラー2" value={settings.gradientTo} onChange={(event) => patch('gradientTo', event.target.value)} /><code>{settings.gradientTo}</code></label>
          </div>
          <RangeField label="グラデーション角度" value={settings.gradientAngle} min={0} max={360} suffix="°" onChange={(value) => patch('gradientAngle', value)} />
          <div className="background-style-row">
            <button type="button" aria-pressed={settings.backgroundStyle === 'soft'} className={settings.backgroundStyle === 'soft' ? 'active' : ''} onClick={() => patch('backgroundStyle', 'soft')}><SparklesIcon />Soft glow</button>
            <button type="button" aria-pressed={settings.backgroundStyle === 'fluid'} className={settings.backgroundStyle === 'fluid' ? 'active' : ''} onClick={() => patch('backgroundStyle', 'fluid')}><SparklesIcon />Fluid ink</button>
            <button type="button" aria-pressed={settings.backgroundStyle === 'clean'} className={settings.backgroundStyle === 'clean' ? 'active' : ''} onClick={() => patch('backgroundStyle', 'clean')}>Clean</button>
          </div>
        </section>

        <section className="settings-section">
          <header><span>04</span><div><strong>ページ取得</strong><small>書き出すページ状態を安定させる</small></div></header>
          <div className="capture-options-row">
            <label><span>ページ取得品質</span><select value={settings.captureScale} onChange={(event) => patch('captureScale', Number(event.target.value) as 1 | 2)}><option value={1}>1× 標準</option><option value={2}>2× 高精細</option></select></label>
            <label><span>待機時間</span><select value={settings.waitMs} onChange={(event) => patch('waitMs', Number(event.target.value))}><option value={0}>なし</option><option value={250}>250 ms</option><option value={500}>500 ms</option><option value={1000}>1 秒</option><option value={2000}>2 秒</option><option value={5000}>5 秒</option></select></label>
          </div>
          <Toggle label="スクロールバーを隠す" checked={settings.hideScrollbars} onChange={(value) => patch('hideScrollbars', value)} />
          <Toggle label="アニメーションを停止" description="遷移とCSSアニメーションを一時停止" checked={settings.pauseAnimations} onChange={(value) => patch('pauseAnimations', value)} />
        </section>

        <section className="settings-section advanced-section">
          <header><span>05</span><div><strong>セルフホスト設定</strong><small>セッション・証明書・デバッグ</small></div></header>
          <Toggle
            label="証明書エラーをホスト単位で許可"
            description={currentHost ? `${currentHost} の全証明書エラー（自己署名限定ではありません）` : '先にURLを開いてください'}
            checked={certificateAllowed}
            disabled={!currentHost}
            onChange={onCertificateAllowed}
          />
          {certificateAllowed && (
            <p className="security-note"><AlertIcon />期限切れ・ホスト名不一致を含む、このホストの全証明書エラーを許可しています。信頼できる開発環境だけで使ってください。</p>
          )}
          <div className="utility-buttons">
            <button type="button" onClick={onResetSession}><TrashIcon />セッションを初期化</button>
            <button type="button" onClick={onOpenDevTools}><WrenchIcon />ページのDevTools</button>
          </div>
        </section>
      </div>
    </aside>
  );
}
