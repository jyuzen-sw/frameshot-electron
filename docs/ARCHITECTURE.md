# FrameShot アーキテクチャ

## プロセスと信頼境界

FrameShotは、操作UI、対象ページ、出力処理を別々のWebContentsとsessionに分離します。見た目を構成するReactコンポーネントとCSSは、ライブ表示と出力処理で共用します。

### Renderer（操作UI）

Reactで構築され、URL、Desktop解像度とモバイル機種のプリセット、撮影設定、ライブキャンバスを担当します。ファイルシステムやElectron APIには直接アクセスせず、preloadが `contextBridge` で公開する限定的な `window.frameShot` APIだけを使用します。

DesktopのヘッダーリストはFull HD以下の5種とWQHD、UWQHD、4K UHDを選び、完成PNGの寸法、Browserフレーム、URL表示を変更しつつ、選択中の余白を維持します。PhoneのヘッダーリストはAndroid、iPhone、iPadのセクションに分かれ、機種に対応する論理viewportとPhone / Tabletフレームを変更します。設定パネルはモードに応じた1組の「Webビューサイズ」だけを編集可能にし、完成サイズは「書き出し予定」として表示します。余白は8 / 16 / 24 / 32pxのボタンと0〜420pxのCustom入力から変更します。モバイル時は完成サイズをページ、フレーム、余白から再計算し、取得品質も2×へ固定します。Desktop / PhoneいずれのCustomもWebビューサイズの幅へフォーカスし、DesktopからPhoneのCustomへ移る場合は390 × 844を開始値にします。Appは設定パネル、Desktop / Phoneメニュー、未表示を単一の排他状態として管理します。Escapeでメニューを閉じた場合だけトリガーへフォーカスを戻し、外側クリックでは現在のフォーカスを強制移動しません。フローティングUIを開閉してもworkspaceのレイアウト、キャンバス、ページviewportの座標と寸法を変えません。

共有プリセットは、解像度グループと完成サイズを持つ `DesktopResolutionPreset` と、機種グループと論理viewportを持つ `MobileDevicePreset` の判別可能なunionです。Desktopプリセットの選択判定は完成サイズだけを使い、余白、フレーム、URL表示の変更ではCustom扱いにしません。`CaptureSettings.phoneFrameVariant` は最後に選択したAndroid / iPhone外観を保持し、iPadやCustomを選んでも上書きしません。

64pxのAppHeaderはブランド、ページ操作、プリセット、書き出し操作をまとめます。ブランド領域は通常の製品名と、処理中、完了、エラーを排他的に表示するHeaderFeedbackを兼ねます。通知はWebContentsViewのbounds外に置くため、対象ページを隠したり状態を失わせたりせずに表示できます。対象ページの読み込みエラーは成功したmain-frame遷移まで保持し、ヘッダーからキャッシュを無視して再試行できます。読み込み中は再読み込み操作を停止へ切り替え、URL欄から別URLを送信した場合は進行中の読み込みを中止して置き換えます。Electronのネイティブアプリケーションメニューは無効化します。保存、URLフォーカス、再読み込みのショートカットは、Main Processが対象ページ側の入力も捕捉して操作UIへ中継するため、どちらにフォーカスがあっても動作します。

Browserフレームのアドレス表示は、現在URLを解析して `host[:port]` とpathnameだけをRendererへ描画します。queryとhashは表示から除外しますが、対象ビューのナビゲーションや書き出しが参照するURLは変更しません。

操作UIはヘッダー、作業領域、設定パネル、メニュー、通知を含めたライトテーマです。淡い青灰の作業領域、白いsurface、濃紺の文字、淡い紫のactive状態を共通のsemantic tokenで表現します。書き出し用のCompositionCanvasはこれらのtokenから分離し、操作UIのテーマ変更が完成PNGへ波及しないようにします。

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

対象URLの`navigate` IPCは、入力検証と`WebContents.loadURL()`の開始後すぐに応答します。ページの完了、失敗、停止は`did-start-loading`、`did-stop-loading`、`did-fail-load`から生成する`NavigationState`通知を正本とし、RendererはIPC Promiseをネットワーク完了のロックとして使いません。利用者による停止と新しいURLによる置換では`WebContents.stop()`を使い、意図した`ERR_ABORTED`をページエラーとして表示しません。

## ライブプレビューの座標同期

Rendererは `CompositionCanvas` を実際の出力寸法で構築し、CSS transformだけでウィンドウ内へ縮小表示します。フレーム内の画面領域を `getBoundingClientRect()` で測定し、その座標をMain Processへ送ります。Main Processは同じ位置・大きさにネイティブの `WebContentsView` を配置します。

これにより、対象ページは本物のChromiumページとしてクリック、スクロール、入力できます。ブラウザバー、スマホベゼル、側面ボタンはRenderer側の装飾です。ネイティブビューはDOMより前面にあるため、ページと交差するパンチホールとDynamic Islandはライブ表示へ重ねず、書き出しRendererだけでページ画像の上へ合成します。

ネイティブの `WebContentsView` はRendererのDOMより前面に描画されるため、設定パネルまたはDesktop / Phoneメニューの表示中は対象ビューへ `visible: false` を送り、ライブページを一時的に隠します。DOM側には「設定を編集中」または「サイズプリセットを選択中」と理由を表示します。閉じると同じ `WebContentsView` を同じ座標へ再表示し、reloadや再生成を行わないため、URL、スクロール、入力、sessionの状態を維持します。

## 共通キャンバス

ライブ表示と書き出しは、同じ `CompositionCanvas`、`BrowserFrame`、コンポーネント所有のplain CSSを使います。外側のキャンバスと内側のアートボードは、背景、余白、フレーム、ページ表示部分を含む完成PNGの寸法へ一致させます。フレーム座標は各辺の余白から配置し、背景効果と影は `overflow: hidden` でアートボード内へ閉じ込めます。

「Webビューサイズ」はモードごとに権威となる値が異なります。Desktopではフレームと余白を含む完成PNGの寸法を権威とし、`論理viewport幅 = 完成幅 - フレーム左右外周 - 余白 × 2`、高さも同様に導出します。モバイルでは対象Webページの論理viewportを権威とし、フレームと余白を加えて完成寸法を導出します。既定のFull HDでは完成サイズ1920 × 1080、論理viewport 1856 × 958、Browser bar 58px、各辺の余白32pxです。Desktopプリセットの余白が32pxの場合は次の値になります。

| プリセット | Webビューサイズ（完成PNG） | 算出viewport |
|---|---:|---:|
| Full HD | 1920 × 1080 | 1856 × 958 |
| Desktop | 1440 × 900 | 1376 × 778 |
| Laptop | 1366 × 768 | 1302 × 646 |
| Compact | 1280 × 800 | 1216 × 678 |
| HD | 1280 × 720 | 1216 × 598 |
| WQHD | 2560 × 1440 | 2496 × 1318 |
| UWQHD | 3440 × 1440 | 3376 × 1318 |
| 4K UHD | 3840 × 2160 | 3776 × 2038 |

WQHD、UWQHD、4K UHDは、2×取得がページ画像の画素上限を超える場合に1×へ変更し、Rendererから通知します。Full HD以下は選択中の1× / 2×を維持します。Desktopプリセット、入力検証、レイアウト計算は同じフレーム外周の定数と正規化関数を参照し、完成サイズと論理viewportの計算がずれないようにします。導出後のviewportが240 × 240未満になる組み合わせはクランプせず拒否し、最後に有効だった設定を維持します。

モバイルでは、選択中のフレームの論理外周をWebビューサイズへ加え、`出力幅 = (Webビュー幅 + 左右外周) × 2 + 余白 × 2`、`出力高さ = (Webビュー高さ + 上下外周) × 2 + 余白 × 2` で完成サイズを決めます。余白は2×拡大せず、完成PNG上の各辺へ指定pxをそのまま使います。Phoneの外周は各辺14px、Tabletは各辺28pxです。既定の余白32pxでは次の値になります。

| セクション | モデル | Webビューサイズ | 自動出力サイズ |
|---|---|---:|---:|
| Android | Google Pixel 10 | 360 × 808 | 840 × 1736 |
| Android | Samsung Galaxy S24 | 360 × 780 | 840 × 1680 |
| iPhone | iPhone 17 | 402 × 874 | 924 × 1868 |
| iPhone | iPhone 17 Pro Max | 440 × 956 | 1000 × 2032 |
| iPad | iPad | 768 × 1024 | 1712 × 2224 |
| iPad | iPad Pro 12.9″ | 1024 × 1366 | 2224 × 2908 |

Android Phoneは外枠40px・画面32pxの角丸、中央の10pxパンチホール、右側の音量・電源ボタンを持ちます。iPhone Phoneは外枠55px・画面47pxの角丸、124 × 32pxのDynamic Island、左側のアクション・音量ボタンと右側の電源ボタンを持ちます。Tabletの既存デザインは変更しません。これらは代表的な外観であり、UA、safe area、OSやモバイルブラウザのUI、モデル固有の細部はエミュレーションしません。

Desktopとモバイルのどちらも、キャンバス、アートボード、完成PNGの寸法は一致します。Desktopのフレームとページ表示部分にはそれぞれ8pxと6pxの角丸を適用します。

背景は既存6種のlinear gradientに加え、Sea Glass Flow、Orchid Tide、Rosewater Ink、Apricot Lilacの4種を提供します。追加したFluid Gradient / Alcohol Ink風の背景は、淡いradial、conic、linear gradientをCSSで重ねて描画し、bitmap素材や外部リソースには依存しません。presetは色、角度、背景styleをまとめて適用し、ライブ表示とPNG書き出しで同じbackground descriptorを使います。

違いはページ領域だけです。ライブ表示ではその位置に `WebContentsView` を重ね、非表示の書き出しRendererでは直前に取得したページPNGを `<img>` として配置します。Browserの装飾と端末の外枠・側面ボタンはページ領域に交差しない位置へ共通描画します。ページ内へ重なるPhoneのパンチホールとDynamic Islandだけは、ネイティブビューを覆えない制約から書き出し時だけ描画します。それ以外はライブ表示用と出力用で同じマークアップとCSSを使います。

RendererのCSSはglobal tokens・reset、App、AppHeader、HeaderFeedback、ViewportMenu、LiveCanvas、CompositionCanvas、SettingsPanel、共有背景効果へ分割し、各コンポーネントが所有するplain CSSを直接importします。意味のあるclass名はE2Eの観測点として維持します。

## Renderer設定の永続化

撮影設定は `localStorage` の `frameshot:settings:v6` へ保存します。v6ではDesktopの完成サイズとモバイルの論理viewportをそれぞれ権威として、従属する寸法を共通関数で正規化します。v5を読み込んだ場合も同じ規則で正規化し、v4以前は既存の外観・既定値移行を適用してから正規化します。最後に選んだAndroid / iPhone外観、余白、その他の撮影設定は維持します。v2〜v5データは削除しないため、旧版へ戻した場合も従来の設定を読み込めます。

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
7. 非永続・cache無効のexport sessionを使う、完成サイズの非表示BrowserWindowで、操作UIと同じReact bundleを `#export` モードで読み込む
8. `CompositionCanvas` のページ領域だけを一度取得可能なページPNGへ差し替える
9. Webフォントとページ画像の描画完了後に、共有レイアウトのアートボード矩形を `capturePage()` へ渡して完成画像を取得する
10. OSの表示倍率に差があれば、最終画像だけをアートボードの実寸へ正規化する
11. 成功・失敗にかかわらずtoken、ページPNG、非表示ウィンドウを破棄する

ページ画像には `no-store`、`nosniff`、`no-referrer`を適用します。Renderer bundleには厳格なCSPを適用し、ページPNGをOSの一時ファイルへ書き込みません。完成PNGは明示的な保存ダイアログまたはクリップボード操作だけでアプリ外へ出ます。保存ファイル名、完了・キャンセル結果、通知にはアートボードの実寸を使用します。

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

Electron ForgeはアプリをASARへ格納し、WindowsではSquirrelのSetup.exe、NuGet package、`RELEASES`を生成します。このローカル生成経路と、Main Window生成前に行うSquirrelのinstall/update/uninstall起動処理は維持します。公開用には、Forgeでpackage化してFuseを適用したWindows x64アプリをelectron-builderのprepackaged入力へ渡し、インストーラー不要の単一portable exeを別経路で生成します。

Electron Fuseは次を強制します。

- RunAsNode、`NODE_OPTIONS`、CLI inspectを無効化
- ASAR integrity validationとOnlyLoadAppFromAsarを有効化
- Cookie暗号化を有効化
- `file://`の追加特権を無効化
- 全Fuse値の明示を必須化

`LoadBrowserProcessSpecificV8Snapshot`だけは無効です。このFuseを有効にするとmain process用の `browser_v8_context_snapshot.bin` が必須ですが、検証したElectron 43配布物には同梱されておらず、ビルドは起動時にfatal errorになりました。Windows成果物へ専用snapshotを生成・同梱する工程を用意するまでは、全rendererでNode integrationを無効にし、context isolationとsandboxを維持します。

公開配布ターゲットはWindows x64だけです。pull requestと `main` pushではLinux上でNode.js 26、`npm ci`、全severityのaudit、型検査、単体テストを行います。`main` pushではWindowsとLinux/Xvfbのパッケージ済みアプリを使い、WebGL2、インメモリ合成、非永続sessionの同じE2Eを検証します。

release workflowは `validate`、`build-windows`、`publish` の順に実行します。`validate`は信頼済みの `main` をcheckoutして初回メタデータ検証コードを読み込み、タグcheckout内のverifierは実行しません。そのうえで、tagが `^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$` に一致する署名付きannotated tagであり、tag objectと直接参照先commitのGitHub署名検証結果がともにVerifiedかつvalidであることを確認します。さらに、タグのversionと `package.json` のversionが一致し、対象commitが `main` のHEADであることを検証します。lightweight tag、tag chain、leading zero、prerelease、検証情報の欠損はfail closedで拒否します。

`build-windows`は検証済みcommit SHAをread-only tokenでcheckoutし、audit、型検査、単体テスト、package、Fuse検査、内側のpackage済みアプリのE2E、portable生成、portable wrapperの起動smoke testを行います。`publish`だけが `contents: write` を持ち、既存のReleaseとdraftを拒否してからportable exeをdraftへ添付します。タグ、署名、commit、`main` HEADがvalidate時から変わっていないことを公開直前に再検証し、成功したdraftだけを通常公開へ切り替えます。再検証に失敗したdraftは自動削除せず、明示的な確認対象として残します。公開assetは `FrameShot-N.N.N-Windows-x64-Portable.exe` の1件だけで、Squirrel成果物とLinux packageは含めません。

tagとcommitのGit署名はソースの来歴をGitHub上で検証しますが、portable exe自体を署名するWindows Authenticodeとは別です。Authenticodeは未設定のため、公開exeは未署名でSmartScreenの警告が表示される可能性があります。portableはインストーラー不要という意味で、設定はWindowsのAppDataに保存されます。exeと同じディレクトリだけで完結するUSB portable動作は提供しません。macOS/Linux向け成果物も現在サポート対象外です。

## 拡張候補

- フルページ撮影と固定要素の処理
- 複数URL・複数プリセットのバッチ出力
- Safe area、OS・ブラウザUI、モデル固有端末フレームの詳細なエミュレーション
- テキスト、ロゴ、バッジのレイヤー
- WebP / JPEG出力
- Playwrightスクリプトによる状態再現
