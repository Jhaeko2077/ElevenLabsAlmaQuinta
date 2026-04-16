import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { IdempotencyRecord } from '../types';

type IdempotencyStore = Record<string, IdempotencyRecord>;

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

export class IdempotencyRepository {
  private readonly filePath: string;
  private writeQueue: Promise<unknown> = Promise.resolve();

  public constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'idempotency.json');
  }

  public async ensureReady(): Promise<void> {
    await ensureJsonObjectFile(this.filePath);
  }

  public async get(key: string): Promise<IdempotencyRecord | null> {
    await this.ensureReady();
    const content = await readFile(this.filePath, 'utf-8');
    const store = (content.trim() ? JSON.parse(content) : {}) as IdempotencyStore;
    return store[key] ?? null;
  }

  public async set(record: IdempotencyRecord): Promise<void> {
    await this.runSerialized(async () => {
      await this.ensureReady();
      const content = await readFile(this.filePath, 'utf-8');
      const store = (content.trim() ? JSON.parse(content) : {}) as IdempotencyStore;
      store[record.key] = record;
      await writeJsonAtomically(this.filePath, `${JSON.stringify(store, null, 2)}\n`);
    });
  }

  private async runSerialized<T>(operation: () => Promise<T>): Promise<T> {
    const nextOperation = this.writeQueue.then(operation, operation);
    this.writeQueue = nextOperation.then(() => undefined, () => undefined);
    return nextOperation;
  }
}
