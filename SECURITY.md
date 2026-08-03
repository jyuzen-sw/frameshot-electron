# セキュリティポリシー

FrameShotは、所有・管理しているサイトや、日常的に利用していて信頼できるサイトを撮影するためのツールです。不特定多数のサイトを閲覧する汎用ブラウザとしては設計していません。

脆弱性を見つけた場合は、公開Issueへ認証情報、秘密URL、Cookie、撮影画像を貼らず、リポジトリ管理者へ非公開で連絡してください。

## 分離と権限

- 本番の操作UIはbundle内のファイルだけを返す `frameshot-app://app/` から配信し、`connect-src 'none'`、`frame-src 'none'`、`worker-src 'none'` などのCSPを適用します。
- 操作UIから外部HTTP(S) URLへの遷移は停止します。URLを表示した警告で許可した場合だけ、権限付き操作UIではなく撮影対象ビューで開きます。
- IPCは操作UIのWebContents IDだけでなく、main frame、process/routing ID、信頼URLを照合し、入力値もMain Processで検証します。
- 撮影対象とOAuthポップアップではNode.jsとpreloadを無効化し、context isolation、renderer sandbox、`webSecurity`、GPU sandboxを維持します。
- カメラ、マイク、位置情報、通知などの権限要求と、対象サイトからのダウンロードは常に拒否します。

## 対象セッションとポップアップ

撮影対象は `persist:` を付けない専用partitionを使用します。Cookie、LocalStorage、キャッシュ、HTTP認証情報などのログイン状態は同じ起動中の対象ビューとOAuthポップアップで共有しますが、アプリ終了後には保持しません。

`window.open`、`target="_blank"`、POST formによるポップアップは、開くたびに同期警告を表示し、既定ではキャンセルします。許可した子画面も同じ非永続sessionとsandbox設定を使います。main-frameではHTTP(S)と一時的な `about:blank` 以外への遷移を拒否します。

「セッションを初期化」すると、対象サイトのポップアップを閉じ、ストレージ、キャッシュ、HTTP認証キャッシュ、接続を消去してから対象ページを再読み込みします。

## 証明書例外

証明書例外は、所有・管理している開発用ホストだけに使用してください。有効化・解除の前に警告を表示し、既定ではキャンセルします。

この例外は自己署名証明書だけを許可するものではありません。許可リストへ追加したホストでは、期限切れ、ホスト名不一致、信頼できない認証局、証明書チェーン不良など、そのホストで発生するすべての証明書検証エラーを受け入れます。例外はホスト単位ですが、そのホストへの中間者攻撃を検出できなくなる可能性があります。

Electronのnetwork serviceは証明書検証結果をキャッシュします。例外変更を確実に反映するため、FrameShotは対象ビューをランダムな新しい非永続sessionへ載せ替え、旧sessionを消去します。変更時にはCookieなどのログイン状態と開いているOAuthポップアップが失われます。

## WebGL互換モード

WebGL / WebGL2サイトの表示を優先するため、ChromiumのGPUブロックリストをプロセス全体で無視し、`enable-unsafe-swiftshader` を既定で有効にしています。

この設定では、通常ブロックされるGPU・ドライバで描画を試みるため、描画崩れ、GPU context loss、GPUプロセス終了が起きる可能性があります。また、SwiftShaderのGPUプロセス内JITは、信頼できないコンテンツに対するセキュリティリスクを増やします。信頼できる撮影対象だけを開いてください。これらを有効にしても、実装非対応のGPU環境でWebGL2を保証するものではありません。

## 画像とファイル

ページPNG、合成HTML、完成PNGはアプリのメモリだけに保持し、終了時に破棄します。合成用の `frameshot-export:` protocolは、推測困難な一時tokenに対応するリソースだけを非永続・cache無効sessionから返し、HTMLは一度しか取得できません。合成データをOSの一時ファイルへ書き出しません。

出力画像と撮影倍率適用後のページ画像には、それぞれ8,294,400画素の上限があります。撮影・再合成は直列化し、同時処理によるメモリ使用量の増大を抑えます。

完成PNGがアプリ外へ出るのは、ユーザーがOSの保存ダイアログで保存先を選んだ場合、またはクリップボードへコピーした場合だけです。長期履歴は保存しません。

## 配布物

公開配布対象はWindows x64です。GitHub Releaseには単一ファイルの `FrameShot-N.N.N-Windows-x64-Portable.exe` だけを添付し、Squirrel成果物とLinux packageは公開しません。Electron ForgeによるWindows Squirrel成果物のローカル生成経路と、そのinstall/update/uninstall起動処理は維持します。パッケージはASARを使用し、Electron FuseでRunAsNode、`NODE_OPTIONS`、CLI inspect、ASAR外からのアプリ読込、`file://`の追加特権を無効化します。ASAR integrityとCookie暗号化も有効化します。

release workflowは初回メタデータ検証に使うコードを信頼済みの `main` から読み込み、タグcheckout内のverifierを実行しません。厳密な `vN.N.N` 形式の署名付きannotated tagだけを処理し、tag objectと、そのタグが直接指すcommitの両方についてGitHubの署名検証結果がVerifiedかつvalidであること、タグのversionと `package.json` のversionが一致すること、対象commitが検証時と公開直前の両方で `main` のHEADであることを確認します。lightweight tagやtag chainは拒否し、検証に必要なGitHub APIの情報が欠けた場合も公開しません。ビルド処理はread-only権限で行い、GitHub Releaseへの書き込み権限は、再検証後にportable exeを公開するjobだけへ限定します。

`LoadBrowserProcessSpecificV8Snapshot` Fuseは無効です。検証したElectron 43配布物に専用の `browser_v8_context_snapshot.bin` がなく、有効化したビルドは起動時にfatal errorになったためです。Windows成果物へ専用snapshotを生成・同梱できるようになるまでは、操作UI・対象サイト・合成画面を含む全rendererでNode integrationを無効にし、context isolationとsandboxを維持します。

タグとcommitのGit署名は、公開するソースの来歴をGitHub上で検証するためのものであり、Windows実行ファイルの発行元を証明するAuthenticode署名ではありません。Windows Authenticodeは未設定のため、公開するportable exeは未署名で、SmartScreenの警告が表示される可能性があります。

portableはインストーラーを使わずに起動できることを意味します。設定はWindowsのAppDataへ保存され、exeと同じディレクトリだけでは完結しないため、USBメモリ内だけにデータを残す運用には対応していません。macOS/Linux向け成果物は現在サポート対象外です。
