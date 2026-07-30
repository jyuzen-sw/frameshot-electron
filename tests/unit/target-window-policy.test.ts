import { describe, expect, it } from 'vitest';
import {
  createCertificateExceptionWarning,
  createCertificateRemovalWarning,
  createTargetPopupWarning,
  isAllowedTargetWindowUrl,
} from '../../src/main/target-window-policy';
import { TARGET_PARTITION } from '../../src/main/security';

describe('target session partition', () => {
  it('uses a non-persistent in-memory partition', () => {
    expect(TARGET_PARTITION).toBe('frameshot-target');
    expect(TARGET_PARTITION.startsWith('persist:')).toBe(false);
  });
});

describe('isAllowedTargetWindowUrl', () => {
  it('allows ordinary HTTP(S) destinations', () => {
    expect(isAllowedTargetWindowUrl('https://example.com/oauth')).toBe(true);
    expect(isAllowedTargetWindowUrl('http://localhost:3000/callback')).toBe(true);
  });

  it('allows about:blank only for popup navigation', () => {
    expect(isAllowedTargetWindowUrl('about:blank')).toBe(false);
    expect(isAllowedTargetWindowUrl('about:blank', true)).toBe(true);
  });

  it('rejects unsupported and malformed destinations', () => {
    expect(isAllowedTargetWindowUrl('file:///tmp/secret', true)).toBe(false);
    expect(isAllowedTargetWindowUrl('javascript:alert(1)', true)).toBe(false);
    expect(isAllowedTargetWindowUrl('data:text/html,hello', true)).toBe(false);
    expect(isAllowedTargetWindowUrl('not a url', true)).toBe(false);
  });
});

describe('target warnings', () => {
  it('makes POST popup data explicit', () => {
    const warning = createTargetPopupWarning(
      'https://accounts.example.com/login',
      true,
    );
    expect(warning.detail).toContain('https://accounts.example.com/login');
    expect(warning.detail).toContain('POSTデータ');
  });

  it('describes the full scope of a certificate exception', () => {
    const warning = createCertificateExceptionWarning('dev.example.test');
    expect(warning.message).toContain('dev.example.test');
    expect(warning.detail).toContain('すべての証明書検証エラー');
    expect(warning.detail).toContain('期限切れ');
    expect(warning.detail).toContain('ホスト名不一致');
    expect(warning.detail).toContain('ログイン状態');
  });

  it('warns that removing an exception recreates the target session', () => {
    const warning = createCertificateRemovalWarning('dev.example.test');
    expect(warning.message).toContain('dev.example.test');
    expect(warning.detail).toContain('証明書検証キャッシュ');
    expect(warning.detail).toContain('ログイン状態');
  });
});
