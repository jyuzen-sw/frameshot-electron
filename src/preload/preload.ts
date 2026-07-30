import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  AppCommand,
  CaptureSettings,
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
  capture: (settings: CaptureSettings) =>
    ipcRenderer.invoke(IPC.capture, settings),
  recompose: (settings: CaptureSettings) =>
    ipcRenderer.invoke(IPC.recompose, settings),
  saveCapture: () => ipcRenderer.invoke(IPC.save),
  copyCapture: () => ipcRenderer.invoke(IPC.copy),
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
  onAppCommand: (listener: (command: AppCommand) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, command: AppCommand) =>
      listener(command);
    ipcRenderer.on(IPC.appCommand, handler);
    return () => ipcRenderer.removeListener(IPC.appCommand, handler);
  },
};

contextBridge.exposeInMainWorld('frameShot', api);
