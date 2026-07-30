import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  CaptureSettings,
  ExportDestination,
  FrameShotApi,
  NavigationState,
  TargetViewLayout,
} from '@shared/types';

const api: FrameShotApi = {
  navigate: (url) => ipcRenderer.invoke(IPC.navigate, url),
  goBack: () => ipcRenderer.invoke(IPC.goBack),
  goForward: () => ipcRenderer.invoke(IPC.goForward),
  reload: (ignoreCache = false) => ipcRenderer.invoke(IPC.reload, ignoreCache),
  setTargetLayout: (layout: TargetViewLayout) => {
    ipcRenderer.send(IPC.setLayout, layout);
  },
  exportImage: (
    settings: CaptureSettings,
    destination: ExportDestination,
  ) => ipcRenderer.invoke(IPC.exportImage, settings, destination),
  resetSession: () => ipcRenderer.invoke(IPC.resetSession),
  openTargetDevTools: () => ipcRenderer.invoke(IPC.openDevTools),
  getPreferences: () => ipcRenderer.invoke(IPC.getPreferences),
  setCertificateAllowed: (host, allowed) =>
    ipcRenderer.invoke(IPC.setCertificateAllowed, host, allowed),
  onNavigationState: (listener: (state: NavigationState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: NavigationState) =>
      listener(state);
    ipcRenderer.on(IPC.navigationState, handler);
    return () => ipcRenderer.removeListener(IPC.navigationState, handler);
  },
};

contextBridge.exposeInMainWorld('frameShot', api);
