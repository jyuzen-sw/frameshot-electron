# FrameShot アーキテクチャ

## プロセスと信頼境界

FrameShotは、操作UI、対象ページ、出力処理を別々のWebContentsとsessionに分離します。見た目を構成するReactコンポーネントとCSSは、ライブ表示と出力処理で共用します。

### Renderer（操作UI）

Reactで構築され、URL、viewportプリセット、出力設定、ライブキャンバスを担当します。ファイルシステムやElectron APIには直接アクセスせず、preloadが `contextBridge` で公開する限定的な `window.frameShot` APIだけを使用します。

Desktop / Mobileのヘッダーリストは、デバイス種別、フレーム、論理ビューポートをまとめて変更します。Customを選んだ場合に設定パネルを開き、ページ表示領域の幅入力へフォーカスします。Appは設定パネル、Desktop / Mobileメニュー、未表示を単一の排他状態として管理します。Escapeでメニューを閉じた場合だけトリガーへフォーカスを戻し、外側クリックでは現在のフォーカスを強制移動しません。フローティングUIを開閉してもworkspaceのレイアウト、キャンバス、ページ表示領域の座標と寸法を変えません。Electronのネイティブアプリケーションメニューは無効化します。保存、URLフォーカス、再読み込みのショートカットは、Main Processが対象ページ側の入力も捕捉して操作UIへ中継するため、どちらにフォーカスがあっても動作します。

本番ビルドは `file://` ではなく `frameshot-app://app/` からbundle内のファイルだけを配信します。protocol handlerはhost、path、methodを検証してpath traversalを拒否し、index HTMLへ次の制約を含むCSPを付けます。

- `connect-src 'none'`
- `frame-src 'none'`
- `worker-src 'none'`
- `object-src 'none'`
- `base-uri 'none'`
- `form-action 'none'`

操作UIの外部ナビゲーション、redirect、`window.open` は停止します。HTTP(S) URLの場合は警告を表示し、ユーザーが許可したときだけ撮影対象ビューへ渡します。

### Main Process

- `TargetBrowserController`: `WebContentsView`、対象ナビゲーション、OAuthポップアップ、論理ビューポート、ページ画像取得
- `ExportService`: 最新ページの取得、共通キャンバスでの合成、完成PNG取得、保存、コピー
- `app-protocol.ts`: 操作UI用 `frameshot-app:` protocolとCSP
- `export-protocol.ts`: 合成用 `frameshot-export:` resource store
- `PreferencesStore`: 証明書例外ホストの永続化
- `security.ts`: 対象sessionの権限、ダウンロード、証明書検証
- `main-window-security.ts`: 操作UIのnavigation guardとdefault session保護
- `ipc.ts`: main frame・信頼URLのsender照合と入力検証

## ライブプレビューの座標同期

Rendererは `CompositionCanvas` を実際の出力寸法で構築し、CSS transformだけでウィンドウ内へ縮小表示します。フレーム内の画面領域を `getBoundingClientRect()` で測定し、その座標をMain Processへ送ります。Main Processは同じ位置・大きさにネイティブの `WebContentsView` を配置します。

これにより、対象ページは本物のChromiumページとしてクリック、スクロール、入力できます。ブラウザバーやスマホベゼルはRenderer側の装飾です。

ネイティブの `WebContentsView` はRendererのDOMより前面に描画されるため、設定パネルまたはDesktop / Mobileメニューの表示中は対象ビューへ `visible: false` を送り、ライブページを一時的に隠します。DOM側には「設定を編集中」または「表示サイズを選択中」と理由を表示します。閉じると同じ `WebContentsView` を同じ座標へ再表示し、reloadや再生成を行わないため、URL、スクロール、入力、sessionの状態を維持します。

## 共通キャンバス

ライブ表示と書き出しは、同じ `CompositionCanvas` コンポーネントと `styles.css` を使います。外側は設定した出力幅・高さを上限とする黒い最大構図キャンバス、内側は背景、glow、grain、フレーム、ページ領域を含むアートボードです。アートボードはBrowser / Phone / Tablet / Noneの装飾を含むフレーム外周から有効余白だけ広げ、最大構図キャンバスへクランプしたうえで、左右・上下の対向辺を個別に整数へ丸めます。フレーム座標はアートボード原点からの相対値に変換し、背景効果と影は `overflow: hidden` で内側に閉じ込めます。

既定余白は32pxです。最大構図キャンバスの縦横比に合わせて余った黒い領域はライブプレビューで構図を確認するためだけに表示し、PNGには含めません。既定の1920 × 1080キャンバス、1440 × 900 BrowserではアートボードとPNGが1592 × 1080になります。DesktopのフレームとViewportにはそれぞれ8pxと6pxの角丸を適用し、Phone / Tablet固有の角丸は変更しません。

背景は既存6種のlinear gradientに加え、Sea Glass Flow、Orchid Tide、Rosewater Ink、Apricot Lilacの4種を提供します。追加したFluid Gradient / Alcohol Ink風の背景は、淡いradial、conic、linear gradientをCSSで重ねて描画し、bitmap素材や外部リソースには依存しません。presetは色、角度、背景styleをまとめて適用し、ライブ表示とPNG書き出しで同じbackground descriptorを使います。

違いはページ領域だけです。ライブ表示ではその位置に `WebContentsView` を重ね、非表示の書き出しRendererでは直前に取得したページPNGを `<img>` として配置します。ライブ表示用と出力用で別々のマークアップやCSSを保守しないため、表示差分が生じにくい構成です。

## Renderer設定の永続化

キャンバス設定は `localStorage` の `frameshot:settings:v4` へ保存します。v4を最優先し、v3データでは旧既定値と一致する `margin: 8` だけを32へ移行します。v2データではmarginを保持し、旧既定値と一致する `cornerRadius: 28` だけを8へ移行します。v2 / v3データは削除しないため、旧版へ戻した場合も従来の設定を読み込めます。

設定パネルの開閉状態は保存対象に含めず、Renderer起動時は常に閉じた状態にします。

## 対象sessionとOAuth

対象ページは `frameshot-target-<UUID>` 形式のランダムなpartitionを使用します。`persist:`を付けないため非永続で、Cookie、LocalStorage、キャッシュ、HTTP認証情報などはアプリ終了時に破棄されます。

通常のHTTP(S)ナビゲーションとredirectは対象ビュー内で維持します。`window.open`、`target="_blank"`、POST formによるpopupは、URLとPOST有無を示す同期警告を毎回表示し、既定ではキャンセルします。許可時はElectron本来のpopupを作るため、POST body、`window.opener`、`postMessage`を維持できます。

子画面はMain Windowをparentとし、対象ビューと同じ非永続sessionを共有します。Node.js、worker/sub-frameのNode integration、preloadを無効にし、context isolation、sandbox、`webSecurity`を有効にします。子画面にも同じpopup policyを再帰的に適用し、main-frameではHTTP(S)と中間状態の `about:blank` 以外を拒否します。

「セッションを初期化」では全popupを閉じ、storage、cache、HTTP auth cache、接続、navigation historyを消去し、対象ページをcache無視で再読み込みします。

## 書き出しフロー

保存またはコピーの操作ごとに、次の処理を最初から行います。

1. 対象ビューを一時的に非表示にする
2. 指定された論理ビューポートと1×/2×倍率を適用する
3. Webフォント、2フレーム、ユーザー指定の待機時間を待つ
4. 必要に応じてスクロールバー、キャレット、アニメーションを一時的に抑制する
5. `capturePage()` で最新のページ画像を取得する
6. UUID tokenを発行し、ページPNGを `frameshot-export:` resource storeへ登録する
7. 非永続・cache無効のexport sessionを使う、黒背景・最大構図サイズの非表示BrowserWindowで、操作UIと同じReact bundleを `#export` モードで読み込む
8. `CompositionCanvas` のページ領域だけを一度取得可能なページPNGへ差し替える
9. Webフォントとページ画像の描画完了後に、共有レイアウトのアートボード矩形を `capturePage()` へ渡して完成画像を取得する
10. OSの表示倍率に差があれば、最終画像だけをアートボードの実寸へ正規化する
11. 成功・失敗にかかわらずtoken、ページPNG、非表示ウィンドウを破棄する

ページ画像には `no-store`、`nosniff`、`no-referrer`を適用します。Renderer bundleには厳格なCSPを適用し、ページPNGをOSの一時ファイルへ書き込みません。完成PNGは明示的な保存ダイアログまたはクリップボード操作だけでアプリ外へ出ます。保存ファイル名、完了・キャンセル結果、通知には最大構図サイズではなくアートボードの実寸を使用します。

書き出しは1件ずつ直列化します。出力画像と、倍率適用後のページ画像には、それぞれ8,294,400画素の上限を設けています。

## メモリ寿命

取得したページ画像と完成画像は、1回の書き出し処理中だけMain Processのメモリに存在します。前回のページ画像や完成PNGはキャッシュしません。背景や枠だけを変えた場合も、保存・コピー時には現在のページ状態を改めて取得します。撮影履歴は保存しません。

## 証明書例外

例外を有効化・解除する際は、対象ホストと影響範囲を示す同期警告を表示し、既定ではキャンセルします。許可したホストでは自己署名だけでなく、期限切れ、ホスト名不一致、信頼できない認証局など、すべての証明書検証エラーを受け入れます。証明書検証を全アプリ・全ホストで無効にはしません。

Electronのnetwork serviceが証明書検証結果をキャッシュするため、例外変更時は対象ビューを新しいランダムpartitionへ載せ替え、旧sessionのストレージ、キャッシュ、認証キャッシュ、接続を消去します。これにより変更を即時反映しますが、対象サイトのログイン状態とポップアップは失われます。許可ホスト名だけはユーザー設定として永続化し、対象session自体は非永続です。

## WebGL互換モード

撮影対象ではWebGL / WebGL2を明示的に有効化し、Chromiumプロセス全体へ `ignore-gpu-blocklist` と `enable-unsafe-swiftshader` を設定します。表示できないサイトを減らすことを優先した既定値です。

GPU sandbox、renderer sandbox、context isolation、`webSecurity`は維持します。ただし、ブロック対象GPUでの描画崩れ・GPU process終了と、SwiftShaderのGPU process内JITによるセキュリティリスクが残ります。そのため、所有・管理しているサイトや信頼できるサイトだけを撮影する用途を前提とします。真にWebGL2非対応の環境で動作を保証する設定ではありません。

## パッケージとCI

Electron ForgeはアプリをASARへ格納し、WindowsではSquirrelのSetup.exe、NuGet package、`RELEASES`を生成します。Squirrelのinstall/update/uninstall起動はMain Window生成前に処理し、App User Model IDを固定します。

Electron Fuseは次を強制します。

- RunAsNode、`NODE_OPTIONS`、CLI inspectを無効化
- ASAR integrity validationとOnlyLoadAppFromAsarを有効化
- Cookie暗号化を有効化
- `file://`の追加特権を無効化
- 全Fuse値の明示を必須化

`LoadBrowserProcessSpecificV8Snapshot`だけは無効です。このFuseを有効にするとmain process用の `browser_v8_context_snapshot.bin` が必須ですが、検証したElectron 43配布物には同梱されておらず、ビルドは起動時にfatal errorになりました。Windows成果物へ専用snapshotを生成・同梱する工程を用意するまでは、全rendererでNode integrationを無効にし、context isolationとsandboxを維持します。

配布ターゲットはWindows x64だけです。pull requestと `main` pushではLinux上でNode.js 26、`npm ci`、全severityのaudit、型検査、単体テストを行います。`main` pushではWindowsとLinux/Xvfbのパッケージ済みアプリを使い、WebGL2、インメモリ合成、非永続sessionの同じE2Eを検証します。tag buildはSquirrel `make`、Fuse検査、成果物検査を含むWindows x64成果物に加え、検証・開発用のLinux x64パッケージをworkflow artifactとして生成します。

Windows Authenticode署名は未設定です。正式リリース前に署名資格情報を安全に扱うCIを追加する必要があります。Linux x64のworkflow artifactを含め、macOS/Linux向け成果物は現在サポート対象外です。

## 拡張候補

- フルページ撮影と固定要素の処理
- 複数URL・複数プリセットのバッチ出力
- Safe area / Android端末枠の追加
- テキスト、ロゴ、バッジのレイヤー
- WebP / JPEG出力
- Playwrightスクリプトによる状態再現
