export const IPC = {
  navigate: 'target:navigate',
  goBack: 'target:back',
  goForward: 'target:forward',
  reload: 'target:reload',
  setLayout: 'target:set-layout',
  navigationState: 'target:navigation-state',
  appShortcut: 'app:shortcut',
  exportImage: 'export:image',
  resetSession: 'target:reset-session',
  openDevTools: 'target:open-devtools',
  getPreferences: 'preferences:get',
  setCertificateAllowed: 'preferences:set-certificate-allowed',
} as const;
