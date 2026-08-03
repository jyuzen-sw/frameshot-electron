<p align="center">
  <img src="assets/frameshot-mark.svg" width="92" alt="FrameShot logo" />
</p>

<h1 align="center">FrameShot</h1>

<p align="center">
  セルフホストしたWebページを操作し、淡い背景・ブラウザ枠・Phone枠・Tablet枠を含む宣伝用PNGへ仕上げるWindows向けElectronアプリ。
</p>

## できること

- URLを入力して、実際のページをアプリ内で操作
- Full HD / WQHD / UWQHD / 4K UHD のDesktop解像度切り替え
- Android / iPhone / iPadの代表モデルに合わせたページ表示サイズ切り替え
- Browser / Phone / Tablet / None のフレーム切り替え
- スクリーンショットサイズ、ページ表示サイズ、余白、角丸、影をフローティング設定パネルで調整
- 既存6種のグラデーションと、淡色のFluid Gradient / Alcohol Ink風CSS背景4種
- ライブ表示と書き出しで同じキャンバス・CSSを使用
- 保存・コピー時に最新のページ状態からPNGを自動生成
- 処理状況とエラーをライブページに隠れないヘッダー内で表示
- OAuthポップアップに対応した、アプリ起動中だけの専用セッション
- 開発環境向けに、証明書検証エラーをホスト単位で許可
- Electronのネイティブメニューバーを表示しない集中型UI

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

初期URLの `http://localhost:4321` を開き、中央のページを操作してから「保存」または「コピー」を押してください。

## 基本操作

1. 上部のURL欄にセルフホストページのURLを入力します。
2. 中央のライブ表示で、スクロール、ログイン、メニュー表示など書き出したい状態を作ります。
3. ヘッダーのDesktopから画面解像度、PhoneからAndroid / iPhone / iPadのモデルを選びます。任意サイズは各リストのCustomから設定パネルを開いて入力します。
4. 必要に応じて設定ボタンからフローティングパネルを開き、スクリーンショットサイズ、ページ表示サイズ、フレーム、背景、余白、影などを調整します。パネルの開閉でスクショ画面の位置や大きさは変わりません。
5. 「保存」または「コピー」を押します。その時点のページを自動取得し、ライブ表示と同じキャンバスから最新のPNGを生成します。

処理中、完了、エラーの案内は左上のFrameShotブランド領域へ表示します。ライブページの上へ重ねないため、案内中もページの表示と操作状態は維持されます。

### サイズ設定とプリセット

設定パネルは設定ボタン、またはDesktop / PhoneリストのCustomから開きます。設定パネルとDesktop / Phoneメニューは同時に一つだけ表示します。いずれかを表示している間は、DOMより前面に描画されるネイティブのライブページだけを一時的に隠し、背景、フレーム、ページ表示サイズはそのまま維持します。閉じると同じページを再読み込みせずに表示するため、URL、スクロール位置、入力内容、ログイン状態は失われません。フローティングUIの開閉状態は保存されず、アプリ起動時は常に閉じています。

「スクリーンショットサイズ」は背景、余白、Browser / Phone / Tabletフレームを含む完成画像全体の最大サイズと縦横比です。「ページ表示サイズ」は、Webページ自体を何pxの画面として表示するかを表す論理ビューポートです。フレーム外周を既定の32pxだけ広げた範囲を実際のアートボードとし、スクリーンショットサイズからはみ出さないように切り詰めます。縦横比調整で余った領域はプレビューだけに表示し、PNGには含めません。

Desktopの解像度プリセットはBrowserフレーム、URL表示、余白32pxを同時に適用します。ページ表示サイズは、横幅から左右の余白64px、縦幅から上下の余白64pxとBrowser bar 58pxを引いて算出します。

| プリセット | スクリーンショットサイズ | ページ表示サイズ |
|---|---:|---:|
| Full HD | 1920 × 1080 | 1856 × 958 |
| WQHD | 2560 × 1440 | 2496 × 1318 |
| UWQHD | 3440 × 1440 | 3376 × 1318 |
| 4K UHD | 3840 × 2160 | 3776 × 2038 |

新規利用時の既定値はFull HDです。WQHD、UWQHD、4K UHDで2×取得が画素上限を超える場合は、自動的に1×へ変更して通知します。Full HDでは選択中の1× / 2×を維持します。

PhoneメニューはAndroid、iPhone、iPadのセクションに分かれ、次のページ表示サイズを適用します。スクリーンショットサイズと余白は変更しません。

| セクション | モデル | ページ表示サイズ |
|---|---|---:|
| Android | Google Pixel 10 | 360 × 808 |
| Android | Samsung Galaxy S24 | 360 × 780 |
| iPhone | iPhone 17 | 402 × 874 |
| iPhone | iPhone 17 Pro Max | 440 × 956 |
| iPad | iPad | 768 × 1024 |
| iPad | iPad Pro 12.9″ | 1024 × 1366 |

機種プリセットが再現するのはページ表示サイズとPhone / Tabletフレームの種別だけです。UA、DPR、safe area、OSやモバイルブラウザのUI、機種固有の端末フレームはエミュレーションしません。

Desktopではフレームを8px、ページ表示部分を6pxの控えめな角丸にし、Phone / Tablet固有の角丸は維持します。背景は従来の6プリセットに加え、Sea Glass Flow、Orchid Tide、Rosewater Ink、Apricot Lilacの4種を選べます。追加背景はビットマップ素材を使わず、淡いFluid Gradient / Alcohol Ink風の多層CSSグラデーションで描画します。

操作UIはヘッダー、作業領域、設定パネル、メニュー、通知までライトテーマで統一します。書き出し用のCompositionCanvasは操作UIのテーマから分離され、選択した背景やフレームの色は変わりません。

設定は `frameshot:settings:v4` に保存します。保存形式は変更せず、既存のv4設定は値を変更せずに読み込むため、新しいプリセットと一致しないサイズもCustomとして引き続き利用できます。v3では旧既定値の余白8pxだけを32pxへ移行し、その他の余白は保持します。v2では余白をそのまま保持し、旧既定値の角丸28pxだけを8pxへ移行します。v2 / v3の保存データは削除しません。

### キーボード

| 操作 | キー |
|---|---|
| URL欄へ移動 | `Ctrl/Cmd + L` |
| PNG保存 | `Ctrl/Cmd + S` |
| 対象ページを再読み込み | `Ctrl/Cmd + R` |

### クリップボード

画像コピーのサポート対象は、FrameShotをネイティブWindows環境で起動した場合です。コピー後にOSのクリップボードから画像を読み戻し、完成PNGと同じ寸法であることを確認してから成功を表示します。

WSL2 / WSLgの `npm start` では、Linux側に書き込んだ画像がWindows側の画像クリップボードへ渡らないため、コピーは未対応として案内します。この場合はネイティブWindows版を起動するか「保存」でPNGを書き出してください。WSLからPowerShellを起動する橋渡しや、ページPNGの一時ファイル作成は行いません。

## アーキテクチャ

```text
BrowserWindow（React製の操作UI）
├─ AppHeader（URL・サイズプリセット・書き出し・状態表示）
├─ CompositionCanvas（スクリーンショットサイズのキャンバス）
│  └─ Artboard（背景・枠・32px余白・影）
│     └─ WebContentsView（操作可能な対象ページ）
└─ フローティング詳細設定
                 │ 保存／コピー
                 ▼
TargetBrowserController.capturePage() → 最新のページPNG
                 │
                 ▼
非表示のExport BrowserWindow（同じReact bundle）
└─ CompositionCanvas（同じマークアップ・CSS）
   └─ ページ部分だけframeshot-export:画像へ差し替え
                 │
                 └─ capturePage(Artboard) → 可変寸法の完成PNG
```

操作UIは本番ビルドでは `frameshot-app://app/` から配信され、外部通信を許可しないCSPを適用します。対象ページとは別のWebContentsで、ページ側にはNode.jsやIPC APIを公開しません。ライブ表示と非表示の書き出しRendererは同じ `CompositionCanvas` とCSSを使い、後者だけがページ領域を `frameshot-export:` のインメモリ画像へ差し替えます。書き出しWindowはスクリーンショットサイズで描画し、共有レイアウトが算出したアートボードだけを取得して正確な実寸へ正規化します。

ページ取得時は、操作中の `WebContentsView` を一時的な非表示 `BaseWindow` へ移し、指定した撮影倍率の物理寸法で再描画します。取得画像が空、または期待寸法と異なる場合は再試行し、古いプレビューsurfaceを引き伸ばして保存しません。完了後は同じviewを操作UIへ戻すため、スクロールやログイン状態は維持されます。

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

完成PNGはOSの保存ダイアログで選んだ場所へ保存するか、クリップボードへコピーした場合だけアプリ外へ出ます。ページPNGを一時ファイルへ書き出しません。

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
npm run make:windows  # Windows x64用Squirrel成果物をローカル生成
npm run make:windows:portable # Windows x64用portable exeを生成
npm run generate:windows-icon # SVGからWindowsアイコンを再生成
npm run test:e2e      # パッケージ化後、Windowを表示せずPlaywrightでE2E
npm run verify        # typecheck + unit test
npm run verify:fuses  # パッケージ済みElectron Fuseを検証
npm run verify:windows-portable # portable exeの名前とPE構造を検証
```

成果物は `out/` 以下に生成されます。

E2Eは既定でElectronのheadless backendを使用し、保存ダイアログやOSクリップボードへ依存せず、テスト専用user data内のPNGを検証します。LinuxではOzone headlessを使い、`DISPLAY`と`WAYLAND_DISPLAY`を渡さず実行します。WSL以外でGUI displayとOSクリップボードを利用できる環境では、`FRAMESHOT_E2E_HEADED=1`を設定して従来のheaded検証も実行できます。

現在の公開配布ターゲットはWindows x64だけです。GitHub Releaseには、インストーラー不要の単一ファイル `FrameShot-N.N.N-Windows-x64-Portable.exe` だけを添付します。Electron ForgeによるSquirrel用の `FrameShot-Setup.exe`、NuGetパッケージ、`RELEASES` のローカル生成経路は維持しますが、Squirrel成果物とLinux packageはGitHub Releaseの対象外です。Electron FuseでRunAsNode、`NODE_OPTIONS`、CLI inspect、ASAR外からのアプリ読込を無効化し、ASAR integrityとCookie暗号化を有効化しています。CIはpull requestと `main` pushでLinux上のaudit、型検査、単体テストを実行し、`main` pushではWindowsとLinuxのパッケージ済みアプリをheadless E2Eで検証します。

`LoadBrowserProcessSpecificV8Snapshot` Fuseは無効です。有効化には `browser_v8_context_snapshot.bin` の同梱が必要ですが、検証したElectron 43配布物では有効化すると起動時にfatal errorになりました。Windows成果物へ専用snapshotを生成・同梱する工程を追加するまでは、全rendererのNode integrationを無効にする現在の分離を維持します。

リリース時に要求するGit署名は、タグとソースcommitの来歴をGitHub上で検証するためのものです。portable exe自体に対するWindows Authenticode署名はまだ設定していないため、ダウンロードや起動時にSmartScreenの警告が表示される可能性があります。また、ここでいうportableはインストーラーが不要という意味です。設定はWindowsのAppDataに保存され、exeと同じディレクトリだけでは完結しないため、USBメモリ内だけに設定を残す用途には対応していません。macOS/Linux向け成果物も現在サポート対象外です。

## リリース手順

GitHub Actionsは、厳密な `vN.N.N` 形式（正規表現では `^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`）の署名付きannotated tagを受け付けます。tag objectと、そのタグが直接指すcommitの両方がGitHubでVerifiedかつvalidであり、`package.json`のversionがタグから`v`を除いた値と一致する必要があります。対象commitは検証時と公開直前の両方で `main` のHEADと完全に一致しなければなりません。lightweight tag、別のtagを指すtag、prerelease表記、leading zeroを含むversionは公開しません。

1. versionを更新し、lockfileを同期します。

   ```bash
   npm version N.N.N --no-git-tag-version
   ```

2. version更新を含む署名付きcommitをPull Requestから `main` へmergeし、最終的にタグが指す `main` のHEAD自体がGitHubでVerifiedであることを確認します。
3. 最新の `main` を取得し、そのHEADへ署名付きannotated tagを作成してpushします。

   ```bash
   git switch main
   git pull --ff-only
   git tag -s vN.N.N -m "FrameShot vN.N.N"
   git push origin vN.N.N
   ```

4. Actionsのrelease workflowが成功したことと、通常公開の `FrameShot vN.N.N` Releaseに `FrameShot-N.N.N-Windows-x64-Portable.exe` が1件だけ添付されていることを確認します。

## プロジェクト構成

```text
src/
├─ main/
│  ├─ main.ts                        Electron起動
│  ├─ app-protocol.ts                操作UI用frameshot-app:配信
│  ├─ target-browser-controller.ts   WebContentsViewと撮影対象
│  ├─ export-service.ts              最新ページの取得・合成・出力
│  ├─ export-protocol.ts             ページPNGの一時インメモリ配信
│  ├─ security.ts                    セッション権限と証明書
│  └─ ipc.ts                         検証付きIPC
├─ preload/
│  └─ preload.ts                     最小APIを公開
├─ renderer/
│  ├─ App.tsx
│  ├─ ExportRenderer.tsx             非表示の書き出しRenderer
│  ├─ components/
│  │  ├─ AppHeader.tsx               操作ヘッダー
│  │  ├─ HeaderFeedback.tsx          処理状況・通知・エラー
│  │  ├─ BrowserFrame.tsx            Browser枠の共通chrome
│  │  └─ CompositionCanvas.tsx       ライブ・書き出し共通キャンバス
│  └─ styles.css                      tokens・reset・共通style入口
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
