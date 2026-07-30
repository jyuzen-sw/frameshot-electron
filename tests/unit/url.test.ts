import { describe, expect, it } from 'vitest';
import {
  formatUrlForFrame,
  getHostname,
  isSupportedTargetUrl,
  normalizeTargetUrl,
} from '@shared/url';

describe('normalizeTargetUrl', () => {
  it('prefers http for localhost and private LAN hosts', () => {
    expect(normalizeTargetUrl('localhost:4321')).toBe('http://localhost:4321/');
    expect(normalizeTargetUrl('192.168.11.20:8080/app')).toBe(
      'http://192.168.11.20:8080/app',
    );
    expect(normalizeTargetUrl('dashboard.local')).toBe('http://dashboard.local/');
    expect(normalizeTargetUrl('devbox:4173/preview')).toBe(
      'http://devbox:4173/preview',
    );
  });

  it('prefers https for ordinary host names', () => {
    expect(normalizeTargetUrl('example.com/path')).toBe('https://example.com/path');
  });

  it('rejects unsupported protocols', () => {
    expect(() => normalizeTargetUrl('file:///tmp/index.html')).toThrow(/http/);
    expect(isSupportedTargetUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('URL helpers', () => {
  it('extracts and formats a target URL', () => {
    const url = 'https://example.com:8443/products?q=one';
    expect(getHostname(url)).toBe('example.com');
    expect(formatUrlForFrame(url)).toBe('example.com:8443/products?q=one');
  });
});
