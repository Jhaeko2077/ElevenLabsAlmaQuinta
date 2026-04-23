import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { StoredHandoff } from '../types';

async function ensureJsonArrayFile(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });

  try {
    await readFile(filePath, 'utf-8');
  } catch {
    await writeFile(filePath, '[]', 'utf-8');
  }
}

async function writeJsonAtomically(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, content, 'utf-8');
  await rename(tempPath, filePath);
}

export class HandoffRepository {
  private readonly filePath: string;
  private writeQueue: Promise<unknown> = Promise.resolve();

  public constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'handoffs.json');
  }

  public async ensureReady(): Promise<void> {
    await ensureJsonArrayFile(this.filePath);
  }

  public async list(): Promise<StoredHandoff[]> {
    await this.ensureReady();
    const content = await readFile(this.filePath, 'utf-8');

    if (!content.trim()) {
      return [];
    }

    return JSON.parse(content) as StoredHandoff[];
  }

  public async create(
    handoff: Omit<StoredHandoff, 'id' | 'created_at'>,
  ): Promise<StoredHandoff> {
    return this.runSerialized(async () => {
      const handoffs = await this.list();
      const record: StoredHandoff = {
        id: randomUUID(),
        created_at: new Date().toISOString(),
        ...handoff,
      };

      handoffs.push(record);
      await writeJsonAtomically(this.filePath, `${JSON.stringify(handoffs, null, 2)}\n`);

      return record;
    });
  }

  private async runSerialized<T>(operation: () => Promise<T>): Promise<T> {
    const nextOperation = this.writeQueue.then(operation, operation);
    this.writeQueue = nextOperation.then(() => undefined, () => undefined);
    return nextOperation;
  }
}
