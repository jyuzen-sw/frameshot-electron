import { isSupportedTargetUrl } from '@shared/url';

export const CANCEL_BUTTON_ID = 0;
export const CONFIRM_BUTTON_ID = 1;

export function isAllowedTargetWindowUrl(
  url: string,
  allowAboutBlank = false,
): boolean {
  if (allowAboutBlank && url === 'about:blank') {
    return true;
  }
  return isSupportedTargetUrl(url);
}

export function createTargetPopupWarning(
  url: string,
  hasPostBody: boolean,
): { message: string; detail: string } {
  const destination =
    url === 'about:blank' ? '空の新規ウィンドウ（about:blank）' : url;
  const postNotice = hasPostBody
    ? '\n\nこの操作にはフォームのPOSTデータが含まれます。'
    : '';

  return {
    message: '対象サイトが新しいウィンドウを開こうとしています。',
    detail: `${destination}${postNotice}\n\n信頼できるサイトの操作であることを確認してから開いてください。`,
  };
}

export function createBlockedPopupWarning(url: string): {
  message: string;
  detail: string;
} {
  return {
    message: '対応していないリンクを拒否しました。',
    detail: `${url}\n\n新しいウィンドウでは http://、https://、または一時的な about:blank だけを開けます。`,
  };
}

export function createCertificateExceptionWarning(host: string): {
  message: string;
  detail: string;
} {
  return {
    message: `${host} の証明書エラーを許可しますか？`,
    detail:
      'この設定は自己署名証明書だけでなく、このホストで発生する期限切れ、ホスト名不一致、信頼できない認証局など、すべての証明書検証エラーを許可します。\n\n変更時は証明書検証キャッシュを確実に破棄するため、対象サイト用セッションを再作成します。Cookieなどのログイン状態と開いているポップアップは失われます。\n\n信頼できる開発環境であることを確認してください。',
  };
}

export function createCertificateRemovalWarning(host: string): {
  message: string;
  detail: string;
} {
  return {
    message: `${host} の証明書例外を解除しますか？`,
    detail:
      '証明書検証キャッシュを確実に破棄するため、対象サイト用セッションを再作成します。Cookieなどのログイン状態と開いているポップアップは失われます。',
  };
}
