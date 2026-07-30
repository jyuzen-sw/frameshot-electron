import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { sendAppCommand } from './ipc';

export function installApplicationMenu(mainWindow: BrowserWindow): void {
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'ファイル',
      submenu: [
        {
          label: 'スクリーンショットを保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendAppCommand(mainWindow, 'save'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: '編集',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '撮影',
      submenu: [
        {
          label: '撮影する',
          accelerator: 'CmdOrCtrl+Enter',
          click: () => sendAppCommand(mainWindow, 'capture'),
        },
        {
          label: 'URL欄へ移動',
          accelerator: 'CmdOrCtrl+L',
          click: () => sendAppCommand(mainWindow, 'focus-url'),
        },
        {
          label: '対象ページを再読み込み',
          accelerator: 'CmdOrCtrl+R',
          click: () => sendAppCommand(mainWindow, 'reload-target'),
        },
      ],
    },
    {
      label: '表示',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(process.env.NODE_ENV === 'development'
          ? ([
              { type: 'separator' },
              { role: 'toggleDevTools' },
            ] as MenuItemConstructorOptions[])
          : []),
      ],
    },
    {
      label: 'ウィンドウ',
      submenu: [{ role: 'minimize' }, ...(isMac ? [{ role: 'front' as const }] : [])],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
