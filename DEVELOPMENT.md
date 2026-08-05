# FrameShot 開発ガイド

FrameShotのセットアップ、検証、ビルド、リリースに関する情報をまとめています。利用方法は[`README.md`](README.md)、プロセス間の信頼境界を含む詳しい設計は[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)を参照してください。

## 必要環境

- Node.js 26.x
- npm 11.x

対応範囲は`package.json`の`engines`と`packageManager`を正本とします。

## セットアップと開発起動

依存関係をインストールします。

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

初期URLの`http://localhost:4321`を開き、中央のページを操作してから「保存」または「コピー」を押すと、ローカルで一連の動作を確認できます。

## アーキテクチャ概要

```text
BrowserWindow（React製の操作UI）
├─ AppHeader（URL・サイズプリセット・書き出し・状態表示）
├─ CompositionCanvas（完成PNGサイズのキャンバス）
│  └─ Artboard（背景・枠・選択した余白・影）
│     └─ WebContentsView（操作可能な対象ページ）
└─ フローティング詳細設定
                 │ 保存／コピー
                 ▼
TargetBrowserController.capturePage() → 最新のページPNG
                 │
                 ▼
一時Export BrowserWindow（同じReact bundle）
└─ CompositionCanvas（同じマークアップ・CSS）
   └─ ページ部分だけframeshot-export:画像へ差し替え
                 │
                 └─ capturePage(Artboard) → 可変寸法の完成PNG
```

操作UIは本番ビルドでは`frameshot-app://app/`から配信され、外部通信を許可しないCSPを適用します。対象ページとは別のWebContentsで、ページ側にはNode.jsやIPC APIを公開しません。ライブ表示と書き出しRendererは同じ`CompositionCanvas`とCSSを使い、後者だけがページ領域を`frameshot-export:`のインメモリ画像へ差し替えます。

ページ取得時は、操作中の`WebContentsView`を一時的な`BaseWindow`へ移し、指定した撮影倍率の物理寸法で再描画します。取得画像が空、期待寸法と異なる、または完成画像の比率が異なる場合は1回再試行し、不完全な画像を保存・コピーしません。完了後は同じviewを操作UIへ戻すため、スクロールやログイン状態は維持されます。

## コマンド

| コマンド | 用途 |
|---|---|
| `npm start` | Electron Forgeで開発起動 |
| `npm run demo` | `localhost:4321`でデモサイトを起動 |
| `npm run audit` | low以上の全severityを対象に依存関係を監査 |
| `npm run typecheck` | TypeScriptを型検査 |
| `npm test` | Vitestの単体テストを実行 |
| `npm run test:watch` | Vitestをwatchモードで実行 |
| `npm run verify` | 型検査と単体テストを実行 |
| `npm run package` | 現在のOS向けにパッケージ化し、Electron Fuseを検証 |
| `npm run make` | Windows x64用Squirrel成果物を生成 |
| `npm run make:windows` | Windows x64用Squirrel成果物を生成 |
| `npm run make:windows:portable` | Windows x64用portable exeを生成 |
| `npm run generate:windows-icon` | 正規SVGからWindows ICOを再生成 |
| `npm run test:e2e` | パッケージ化後にPlaywright E2Eを実行 |
| `npm run test:e2e:prepared` | 既にパッケージ化されたアプリでE2Eを実行 |
| `npm run test:e2e:windows-capture` | Windowsの反復保存・clipboardをretryなしで検証 |
| `npm run test:e2e:windows-clipboard` | Windowsのclipboardテストだけをretryなしで検証 |
| `npm run verify:fuses` | パッケージ済みElectron Fuseを検証 |
| `npm run verify:windows-portable` | portable exeの名前とPE構造を検証 |
| `npm run verify:windows-artifacts` | Squirrel成果物と`RELEASES`の整合性を検証 |

成果物は`out/`以下に生成されます。

## E2EとCI

通常のE2EはElectronのheadless backendを使用し、保存ダイアログやOSクリップボードへ依存せず、テスト専用user data内のPNGを検証します。LinuxではOzone headlessを使い、`DISPLAY`と`WAYLAND_DISPLAY`を渡さず実行します。WSL以外でGUI displayとOSクリップボードを利用できる環境では、`FRAMESHOT_E2E_HEADED=1`を設定してheaded検証も実行できます。

Windowsのcaptureテストは1× / 2×とDesktop / Mobileを切り替えながら10回連続保存し、四隅と中央のpixelを確認します。続けて別Electron processからOSクリップボード上の画像と、コピー後のFrameShot process・IPCの生存を確認します。

`.github/workflows/ci.yml`では次を実行します。

- pull requestと`main`へのpush: Linuxでaudit、型検査、単体テスト
- pull request: Windowsでパッケージ化し、capture・clipboard E2E
- `main`へのpush: WindowsとLinuxのパッケージ済みアプリでheadless E2E

## Windowsビルドと配布形式

公開配布ターゲットはWindows x64です。GitHub Releaseには、インストーラー不要の単一ファイル`FrameShot-N.N.N-Windows-x64-Portable.exe`だけを添付します。Electron ForgeによるSquirrel用の`FrameShot-Setup.exe`、NuGetパッケージ、`RELEASES`のローカル生成経路は維持しますが、Squirrel成果物とLinux packageはGitHub Releaseの対象外です。

Electron FuseではRunAsNode、`NODE_OPTIONS`、CLI inspect、ASAR外からのアプリ読込を無効化し、ASAR integrityとCookie暗号化を有効化しています。

`LoadBrowserProcessSpecificV8Snapshot` Fuseは無効です。有効化には`browser_v8_context_snapshot.bin`の同梱が必要ですが、検証したElectron 43配布物では有効化すると起動時にfatal errorになりました。Windows成果物へ専用snapshotを生成・同梱する工程を追加するまでは、全rendererのNode integrationを無効にする現在の分離を維持します。

リリース時に要求するGit署名は、タグとソースcommitの来歴をGitHub上で検証するためのものです。portable exe自体に対するWindows Authenticode署名はまだ設定していません。

## リリース手順

GitHub Actionsは、厳密な`vN.N.N`形式の署名付きannotated tagを受け付けます。tag objectと、そのタグが直接指すcommitの両方がGitHubでVerifiedかつvalidであり、`package.json`のversionがタグから`v`を除いた値と一致する必要があります。対象commitは検証時と公開直前の両方で`main`のHEADと完全に一致しなければなりません。lightweight tag、別のtagを指すtag、prerelease表記、leading zeroを含むversionは公開しません。

1. versionを更新し、lockfileを同期します。

   ```bash
   npm version N.N.N --no-git-tag-version
   ```

2. version更新を含む署名付きcommitをPull Requestから`main`へmergeし、最終的にタグが指す`main`のHEAD自体がGitHubでVerifiedであることを確認します。
3. 最新の`main`を取得し、そのHEADへ署名付きannotated tagを作成してpushします。

   ```bash
   git switch main
   git pull --ff-only
   git tag -s vN.N.N -m "FrameShot vN.N.N"
   git push origin vN.N.N
   ```

4. Actionsのrelease workflowが成功したことと、通常公開の`FrameShot vN.N.N` Releaseに`FrameShot-N.N.N-Windows-x64-Portable.exe`が1件だけ添付されていることを確認します。

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
