<p align="center">
  <img src="assets/frameshot-mark.svg" width="92" alt="FrameShot logo" />
</p>

<h1 align="center">FrameShot</h1>

<p align="center">
  セルフホストしたWebページを操作し、淡い背景・ブラウザ枠・スマホ枠を含む宣伝用PNGへ仕上げるWindows向けElectronアプリ。
</p>

## できること

- URLを入力して、実際のページをアプリ内で操作
- Desktop / Mobile の論理ビューポート切り替え
- Browser / Phone / None のフレーム切り替え
- 出力サイズ、ページ表示サイズ、余白、角丸、影を個別に設定
- 淡いグラデーションのプリセットと任意色
- ページを再撮影せず、背景と枠だけを「再合成」
- PNG保存、クリップボードへの画像コピー
- OAuthポップアップに対応した、アプリ起動中だけの専用セッション
- 開発環境向けに、証明書検証エラーをホスト単位で許可
- 設定プリセットのローカル保存

## すぐ試す

必要環境は Node.js 26.x と npm 11.x です。

```bash
npm install
```

ターミナル1で同梱のデモサイトを起動します。

```bash
npm run demo
```

ターミナル2でFrameShotを起動します。

```bash
npm start
```

初期URLの `http://localhost:4321` を開き、中央のページを操作してから「撮影」を押してください。

## 基本操作

1. 上部のURL欄にセルフホストページのURLを入力します。
2. 「操作」モードで、スクロール、ログイン、メニュー表示など撮りたい状態を作ります。
3. Desktop / Mobile とフレームを選びます。
4. 右側で出力サイズ、背景、余白、影などを調整します。
5. 「撮影」で完成PNGを生成します。
6. 見た目だけ変えた場合は「再合成」、ビューポートを変えた場合は「再撮影」を使います。
7. 「PNG保存」または「コピー」で取り出します。

### キーボード

| 操作 | キー |
|---|---|
| URL欄へ移動 | `Ctrl/Cmd + L` |
| 撮影 | `Ctrl/Cmd + Enter` |
| PNG保存 | `Ctrl/Cmd + S` |
| 対象ページを再読み込み | `Ctrl/Cmd + R` |

## アーキテクチャ

```text
BrowserWindow（React製の操作UI）
├─ URL・プリセット・背景・出力設定
└─ WebContentsView（非永続の専用セッション）
   └─ 撮影対象ページ（専用セッション / sandbox）
          │
          ├─ capturePage() → ページ画像
          │
          ▼
frameshot-export: + 非表示のExport BrowserWindow
├─ 淡いグラデーション背景
├─ Browser / Phone / None フレーム
├─ 角丸・余白・影
└─ ページ画像
          │
          └─ capturePage() → 完成PNG
```

操作UIは本番ビルドでは `frameshot-app://app/` から配信され、外部通信を許可しないCSPを適用します。対象ページとは別のWebContentsで、ページ側にはNode.jsやIPC APIを公開しません。完成画像は `frameshot-export:` でメモリから供給する出力専用ウィンドウで正確な寸法に合成します。

詳しくは [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) を参照してください。

## セッションとOAuth

対象ページとOAuthポップアップは、同じ非永続セッションを共有します。ポップアップを開くたびにURLを含む警告を表示し、既定ではキャンセルします。許可したポップアップもsandbox内で動作し、Node.jsやpreloadは利用できません。

Cookie、LocalStorage、HTTP認証キャッシュなどのログイン情報はアプリ終了時に破棄されます。「セッションを初期化」では、開いているポップアップを閉じたうえでストレージ、キャッシュ、認証キャッシュ、接続を消去します。

## 証明書エラーの例外

開発用HTTPSで証明書エラーが出る場合、右側の「証明書エラーをホスト単位で許可」を有効にできます。これは自己署名証明書だけの例外ではありません。許可したホストでは、期限切れ、ホスト名不一致、信頼できない認証局などを含む、すべての証明書検証エラーを受け入れます。

有効化・解除の前に確認ダイアログを表示し、既定ではキャンセルします。変更時はElectronの証明書検証キャッシュを確実に破棄するため、対象サイト用セッションを新しく作り直します。このときCookieなどのログイン状態と開いているOAuthポップアップは失われます。許可済みホスト名はOSのアプリデータ領域にある `preferences.json` へ保存されます。信頼できるLAN・開発環境に限って利用してください。

## セキュリティ上の既定値

- 操作UIを `frameshot-app:` と厳格なCSPで配信
- 操作UIからの外部遷移を停止し、警告後に撮影対象ビューで開く
- 対象ページの `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- カメラ、マイク、通知、位置情報などの権限を拒否
- 対象ページからのダウンロードを拒否
- `http:` / `https:` 以外のナビゲーションを拒否
- OAuthを含むポップアップは毎回警告し、同じ非永続対象セッションで隔離
- アプリUIのmain frame・URLを照合し、Main Processへ渡す値を検証
- PNG合成データを `frameshot-export:` 経由で完全にメモリ内処理
- 出力画像と撮影倍率適用後のページ画像を各8,294,400画素以下に制限

完成PNGはOSの保存ダイアログで選んだ場所へ保存するか、クリップボードへコピーした場合だけアプリ外へ出ます。合成HTMLやページPNGを一時ファイルへ書き出しません。

### WebGL互換モード

撮影対象ではWebGL / WebGL2を有効にし、Chromiumプロセス全体でGPUブロックリストを無視します。さらに、表示できないサイトを減らすため `enable-unsafe-swiftshader` も既定で有効です。GPU sandbox、renderer sandbox、`webSecurity` は維持します。

この設定は対応範囲を広げる一方、ブロック対象GPUでの描画崩れ・GPUプロセス終了や、SwiftShaderのGPUプロセス内JITに伴うセキュリティリスクを増やします。FrameShotは所有・管理しているサイトや、日常的に利用していて信頼できるサイトの撮影用途を前提としています。不特定多数のサイトを閲覧するブラウザとして使用しないでください。

## コマンド

```bash
npm start             # 開発起動
npm run demo          # localhost:4321 のデモサイト
npm run audit         # 全severityを対象にnpm audit
npm run typecheck     # TypeScriptチェック
npm test              # Vitest
npm run package       # 現在のOS向けにパッケージ化
npm run make:windows  # Windows x64用インストーラー／配布物を生成
npm run generate:windows-icon # SVGからWindowsアイコンを再生成
npm run test:e2e      # パッケージ化後にPlaywrightでE2E
npm run verify        # typecheck + unit test
npm run verify:fuses  # パッケージ済みElectron Fuseを検証
```

成果物は `out/` 以下に生成されます。

現在の配布ターゲットはWindows x64だけです。Squirrel用の `FrameShot-Setup.exe`、NuGetパッケージ、`RELEASES` を生成します。Electron FuseでRunAsNode、`NODE_OPTIONS`、CLI inspect、ASAR外からのアプリ読込を無効化し、ASAR integrityとCookie暗号化を有効化しています。CIはWindows上でaudit、型検査、単体テスト、Squirrel成果物、Fuse、パッケージ済みアプリのE2Eを検証します。Linux/Xvfbは配布物を作らず、同じ既知シナリオの補助検査だけを行います。

`LoadBrowserProcessSpecificV8Snapshot` Fuseは無効です。有効化には `browser_v8_context_snapshot.bin` の同梱が必要ですが、検証したElectron 43配布物では有効化すると起動時にfatal errorになりました。Windows成果物へ専用snapshotを生成・同梱する工程を追加するまでは、全rendererのNode integrationを無効にする現在の分離を維持します。

Windows Authenticode署名と配布用資格情報はまだ設定していません。現在の成果物は開発・検証用途です。一般公開前に署名と、資格情報を安全に扱うリリース手順を追加してください。macOS/Linux向け成果物は現在サポート対象外です。

## プロジェクト構成

```text
src/
├─ main/
│  ├─ main.ts                        Electron起動
│  ├─ app-protocol.ts                操作UI用frameshot-app:配信
│  ├─ target-browser-controller.ts   WebContentsViewと撮影対象
│  ├─ capture-service.ts             PNG合成・保存・コピー
│  ├─ export-protocol.ts             インメモリ合成リソース
│  ├─ composition-html.ts            出力専用HTML/CSS
│  ├─ security.ts                    セッション権限と証明書
│  └─ ipc.ts                         検証付きIPC
├─ preload/
│  └─ preload.ts                     最小APIを公開
├─ renderer/
│  ├─ App.tsx
│  ├─ components/
│  └─ styles.css
└─ shared/
   ├─ types.ts
   ├─ presets.ts
   ├─ layout.ts
   ├─ validation.ts
   └─ url.ts
```

## 現在のMVP範囲

撮影対象は「現在のビューポート」です。ページ全体の縦長キャプチャ、複数URLの一括撮影、動画、注釈、ロゴ・テキストレイヤーは未実装です。固定ヘッダーの重複などを避けるため、フルページ撮影は別機能として追加する想定です。

## ライセンス

MIT
