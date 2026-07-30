const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:']);

function looksLikeLocalAddress(value: string): boolean {
  const authority = value.split(/[/?#]/)[0]?.toLowerCase() ?? '';
  const host = authority.startsWith('[')
    ? authority
    : authority.replace(/:\d+$/, '');
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith('.local') ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    /^\[[0-9a-f:]+\](?::\d+)?$/i.test(authority) ||
    (!host.includes('.') && /^[a-z0-9-]+$/i.test(host))
  );
}

export function normalizeTargetUrl(input: string): string {
  const value = input.trim();
  if (!value) {
    throw new Error('URLを入力してください。');
  }

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value
    : `${looksLikeLocalAddress(value) ? 'http' : 'https'}://${value}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error('URLの形式が正しくありません。');
  }

  if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error('http:// または https:// のURLだけを開けます。');
  }

  if (!parsed.hostname) {
    throw new Error('ホスト名がありません。');
  }

  return parsed.toString();
}

export function isSupportedTargetUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return SUPPORTED_PROTOCOLS.has(parsed.protocol) && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function getHostname(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function formatUrlForFrame(value: string): string {
  try {
    const parsed = new URL(value);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${parsed.host}${path}${parsed.search}`;
  } catch {
    return value;
  }
}
