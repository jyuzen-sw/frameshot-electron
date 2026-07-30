import type { Session } from 'electron';
import type { PreferencesStore } from './preferences-store';

export const TARGET_PARTITION = 'frameshot-target';

const downloadGuardedSessions = new WeakSet<Session>();

export function configureTargetSession(
  targetSession: Session,
  preferences: PreferencesStore,
): void {
  targetSession.setPermissionCheckHandler(() => false);
  targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  targetSession.setCertificateVerifyProc((request, callback) => {
    if (preferences.isCertificateHostAllowed(request.hostname)) {
      callback(0);
      return;
    }
    callback(-3);
  });

  if (!downloadGuardedSessions.has(targetSession)) {
    downloadGuardedSessions.add(targetSession);
    targetSession.on('will-download', (event) => {
      event.preventDefault();
    });
  }
}
