import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { GoogleOAuthTokenRecord } from '../types';

async function ensureJsonObjectFile(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });

  try {
    await readFile(filePath, 'utf-8');
  } catch {
    await writeFile(filePath, '{}', 'utf-8');
  }
}

async function writeJsonAtomically(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, content, 'utf-8');
  await rename(tempPath, filePath);
}

export class GoogleOAuthTokenRepository {
  private readonly filePath: string;
  private writeQueue: Promise<unknown> = Promise.resolve();

  public constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'google-oauth-token.json');
  }

  public async ensureReady(): Promise<void> {
    await ensureJsonObjectFile(this.filePath);
  }

  public async get(): Promise<GoogleOAuthTokenRecord | null> {
    await this.ensureReady();
    const content = await readFile(this.filePath, 'utf-8');
    const parsed = (content.trim() ? JSON.parse(content) : {}) as Partial<GoogleOAuthTokenRecord>;

    if (!parsed.refresh_token) {
      return null;
    }

    return {
      refresh_token: parsed.refresh_token,
      updated_at: parsed.updated_at ?? new Date(0).toISOString(),
    };
  }

  public async getRefreshToken(): Promise<string | null> {
    const record = await this.get();
    return record?.refresh_token ?? null;
  }

  public async hasConnection(): Promise<boolean> {
    return Boolean(await this.getRefreshToken());
  }

  public async saveRefreshToken(refreshToken: string): Promise<GoogleOAuthTokenRecord> {
    return this.runSerialized(async () => {
      const record: GoogleOAuthTokenRecord = {
        refresh_token: refreshToken,
        updated_at: new Date().toISOString(),
      };

      await this.ensureReady();
      await writeJsonAtomically(this.filePath, `${JSON.stringify(record, null, 2)}\n`);

      return record;
    });
  }

  private async runSerialized<T>(operation: () => Promise<T>): Promise<T> {
    const nextOperation = this.writeQueue.then(operation, operation);
    this.writeQueue = nextOperation.then(() => undefined, () => undefined);
    return nextOperation;
  }
}
