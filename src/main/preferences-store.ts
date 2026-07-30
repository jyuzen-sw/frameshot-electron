import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { UserPreferences } from '@shared/types';

const DEFAULT_PREFERENCES: UserPreferences = {
  allowedCertificateHosts: [],
};

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

export class PreferencesStore {
  private readonly filePath: string;
  private preferences: UserPreferences = { ...DEFAULT_PREFERENCES };

  public constructor() {
    this.filePath = path.join(app.getPath('userData'), 'preferences.json');
  }

  public async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<UserPreferences>;
      const hosts = Array.isArray(parsed.allowedCertificateHosts)
        ? parsed.allowedCertificateHosts
            .filter((host): host is string => typeof host === 'string')
            .map(normalizeHost)
            .filter(Boolean)
        : [];
      this.preferences = {
        allowedCertificateHosts: [...new Set(hosts)],
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn('Failed to load preferences:', error);
      }
      this.preferences = { ...DEFAULT_PREFERENCES };
    }
  }

  public get(): UserPreferences {
    return {
      allowedCertificateHosts: [...this.preferences.allowedCertificateHosts],
    };
  }

  public isCertificateHostAllowed(host: string): boolean {
    return this.preferences.allowedCertificateHosts.includes(normalizeHost(host));
  }

  public async setCertificateHostAllowed(
    host: string,
    allowed: boolean,
  ): Promise<UserPreferences> {
    const normalized = normalizeHost(host);
    if (!normalized) {
      throw new Error('ホスト名がありません。');
    }

    const next = new Set(this.preferences.allowedCertificateHosts);
    if (allowed) {
      next.add(normalized);
    } else {
      next.delete(normalized);
    }

    this.preferences = {
      allowedCertificateHosts: [...next].sort(),
    };
    await this.save();
    return this.get();
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(this.preferences, null, 2)}\n`,
      'utf8',
    );
    await fs.rename(temporaryPath, this.filePath);
  }
}
