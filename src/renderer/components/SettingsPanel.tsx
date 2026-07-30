import { useMemo, useState } from 'react';
import { CAPTURE_PRESETS, GRADIENT_PRESETS } from '@shared/presets';
import type {
  CapturePreset,
  CaptureSettings,
  CustomPreset,
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

interface SettingsPanelProps {
  settings: CaptureSettings;
  customPresets: CustomPreset[];
  currentHost: string | null;
  certificateAllowed: boolean;
  captureAvailable: boolean;
  needsRecompose: boolean;
  viewportChangedSinceCapture: boolean;
  busy: boolean;
  onClose: () => void;
  onSettingsChange: React.Dispatch<React.SetStateAction<CaptureSettings>>;
  onApplyPreset: (preset: CapturePreset | CustomPreset) => void;
  onSaveCustomPreset: (name: string) => void;
  onDeleteCustomPreset: (id: string) => void;
  onCertificateAllowed: (allowed: boolean) => void;
  onResetSession: () => void;
  onOpenDevTools: () => void;
  onRecompose: () => void;
  onCapture: () => void;
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: NumberFieldProps): React.JSX.Element {
  return (
    <label className="number-field">
      <span>{label}</span>
      <span className="number-input-wrap">
        <input
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
  customPresets,
  currentHost,
  certificateAllowed,
  captureAvailable,
  needsRecompose,
  viewportChangedSinceCapture,
  busy,
  onClose,
  onSettingsChange,
  onApplyPreset,
  onSaveCustomPreset,
  onDeleteCustomPreset,
  onCertificateAllowed,
  onResetSession,
  onOpenDevTools,
  onRecompose,
  onCapture,
}: SettingsPanelProps): React.JSX.Element {
  const [presetName, setPresetName] = useState('');

  const patch = <K extends keyof CaptureSettings>(
    key: K,
    value: CaptureSettings[K],
  ) => onSettingsChange((current) => ({ ...current, [key]: value }));

  const exactPresetId = useMemo(() => {
    const fingerprint = JSON.stringify(settings);
    const all = [...CAPTURE_PRESETS, ...customPresets];
    return all.find((preset) => JSON.stringify(preset.settings) === fingerprint)?.id;
  }, [customPresets, settings]);

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
          <header><span>01</span><div><strong>プリセット</strong><small>用途に合わせて一括設定</small></div></header>
          <div className="preset-grid">
            {CAPTURE_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.id}
                className={`preset-card ${exactPresetId === preset.id ? 'active' : ''}`}
                onClick={() => onApplyPreset(preset)}
              >
                <span className="preset-icon">
                  {preset.settings.deviceMode === 'mobile' ? <PhoneIcon /> : <MonitorIcon />}
                </span>
                <span><b>{preset.name}</b><small>{preset.settings.outputWidth} × {preset.settings.outputHeight}</small></span>
                {exactPresetId === preset.id && <CheckIcon className="preset-check" />}
              </button>
            ))}
          </div>

          {customPresets.length > 0 && (
            <div className="custom-preset-list">
              {customPresets.map((preset) => (
                <div key={preset.id} className={exactPresetId === preset.id ? 'active' : ''}>
                  <button type="button" onClick={() => onApplyPreset(preset)}>
                    <SparklesIcon /><span><b>{preset.name}</b><small>{preset.settings.outputWidth} × {preset.settings.outputHeight}</small></span>
                  </button>
                  <button type="button" className="delete-preset" title="削除" onClick={() => onDeleteCustomPreset(preset.id)}><TrashIcon /></button>
                </div>
              ))}
            </div>
          )}

          <form
            className="save-preset-row"
            onSubmit={(event) => {
              event.preventDefault();
              const name = presetName.trim();
              if (!name) return;
              onSaveCustomPreset(name);
              setPresetName('');
            }}
          >
            <input value={presetName} maxLength={32} placeholder="現在の設定に名前を付ける" onChange={(event) => setPresetName(event.target.value)} />
            <button type="submit" disabled={!presetName.trim()}>保存</button>
          </form>
        </section>

        <section className="settings-section">
          <header><span>02</span><div><strong>サイズ</strong><small>出力画像とWebページの表示領域</small></div></header>
          <div className="subheading"><span>出力キャンバス</span><em>PNG</em></div>
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

          <div className="subheading"><span>ページ表示領域</span><em>{settings.deviceMode}</em></div>
          <div className="two-column-fields">
            <NumberField label="幅" value={settings.viewportWidth} min={240} max={3840} suffix="px" onChange={(value) => patch('viewportWidth', value)} />
            <NumberField label="高さ" value={settings.viewportHeight} min={240} max={3840} suffix="px" onChange={(value) => patch('viewportHeight', value)} />
          </div>
          <div className="quick-size-row viewport">
            <button type="button" onClick={() => onSettingsChange((current) => ({ ...current, deviceMode: 'desktop', viewportWidth: 1440, viewportHeight: 900 }))}>Desktop</button>
            <button type="button" onClick={() => onSettingsChange((current) => ({ ...current, deviceMode: 'mobile', viewportWidth: 390, viewportHeight: 844 }))}>iPhone</button>
            <button type="button" onClick={() => onSettingsChange((current) => ({ ...current, deviceMode: 'mobile', viewportWidth: 412, viewportHeight: 915 }))}>Android</button>
          </div>
        </section>

        <section className="settings-section">
          <header><span>03</span><div><strong>フレーム</strong><small>ブラウザ・スマホ・枠なし</small></div></header>
          <div className="frame-selector">
            <button type="button" className={settings.frameStyle === 'browser' ? 'active' : ''} onClick={() => setFrame('browser')}><MonitorIcon /><span>Browser</span></button>
            <button type="button" className={settings.frameStyle === 'phone' ? 'active' : ''} onClick={() => setFrame('phone')}><PhoneIcon /><span>Phone</span></button>
            <button type="button" className={settings.frameStyle === 'none' ? 'active' : ''} onClick={() => setFrame('none')}><span className="frame-none-icon">□</span><span>None</span></button>
          </div>
          <RangeField label="背景とフレームの余白" value={settings.margin} min={0} max={420} suffix="px" onChange={(value) => patch('margin', value)} />
          <RangeField label="角丸" value={settings.cornerRadius} min={0} max={80} suffix="px" onChange={(value) => patch('cornerRadius', value)} />
          <RangeField label="影の強さ" value={settings.shadow} min={0} max={100} suffix="%" onChange={(value) => patch('shadow', value)} />
          {settings.frameStyle === 'browser' && (
            <Toggle label="アドレスを表示" description="ブラウザ枠内にホスト名を表示" checked={settings.showUrl} onChange={(value) => patch('showUrl', value)} />
          )}
        </section>

        <section className="settings-section">
          <header><span>04</span><div><strong>背景色</strong><small>プリセットまたは2色を選んで調整</small></div></header>
          <div className="subheading"><span>背景グラデーション</span><em>COLOR</em></div>
          <div className="gradient-grid">
            {GRADIENT_PRESETS.map((gradient) => {
              const active = settings.gradientFrom === gradient.from && settings.gradientTo === gradient.to;
              return (
                <button
                  type="button"
                  key={gradient.id}
                  className={active ? 'active' : ''}
                  title={gradient.name}
                  style={{ background: `linear-gradient(${gradient.angle}deg, ${gradient.from}, ${gradient.to})` }}
                  onClick={() => onSettingsChange((current) => ({ ...current, gradientFrom: gradient.from, gradientTo: gradient.to, gradientAngle: gradient.angle }))}
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
            <button type="button" className={settings.backgroundStyle === 'soft' ? 'active' : ''} onClick={() => patch('backgroundStyle', 'soft')}><SparklesIcon />Soft glow</button>
            <button type="button" className={settings.backgroundStyle === 'clean' ? 'active' : ''} onClick={() => patch('backgroundStyle', 'clean')}>Clean</button>
          </div>
        </section>

        <section className="settings-section">
          <header><span>05</span><div><strong>撮影</strong><small>ページ状態を安定させて取得</small></div></header>
          <div className="capture-options-row">
            <label><span>ページ撮影品質</span><select value={settings.captureScale} onChange={(event) => patch('captureScale', Number(event.target.value) as 1 | 2)}><option value={1}>1× 標準</option><option value={2}>2× 高精細</option></select></label>
            <label><span>待機時間</span><select value={settings.waitMs} onChange={(event) => patch('waitMs', Number(event.target.value))}><option value={0}>なし</option><option value={250}>250 ms</option><option value={500}>500 ms</option><option value={1000}>1 秒</option><option value={2000}>2 秒</option><option value={5000}>5 秒</option></select></label>
          </div>
          <Toggle label="スクロールバーを隠す" checked={settings.hideScrollbars} onChange={(value) => patch('hideScrollbars', value)} />
          <Toggle label="アニメーションを停止" description="遷移とCSSアニメーションを一時停止" checked={settings.pauseAnimations} onChange={(value) => patch('pauseAnimations', value)} />

          {captureAvailable && (needsRecompose || viewportChangedSinceCapture) && (
            <div className={`recompose-card ${viewportChangedSinceCapture ? 'warn' : ''}`}>
              <span>{viewportChangedSinceCapture ? <AlertIcon /> : <SparklesIcon />}</span>
              <div>
                <b>{viewportChangedSinceCapture ? 'ページ領域が変わっています' : '見た目の設定が変わりました'}</b>
                <small>{viewportChangedSinceCapture ? '再合成はできますが、最良の結果には再撮影してください。' : 'ページを再撮影せず、枠と背景だけ更新できます。'}</small>
              </div>
              <button type="button" disabled={busy} onClick={viewportChangedSinceCapture ? onCapture : onRecompose}>{viewportChangedSinceCapture ? '再撮影' : '再合成'}</button>
            </div>
          )}
        </section>

        <section className="settings-section advanced-section">
          <header><span>06</span><div><strong>セルフホスト設定</strong><small>セッション・証明書・デバッグ</small></div></header>
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
