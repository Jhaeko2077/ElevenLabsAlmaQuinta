import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { StoredLead } from '../types';

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

export class LeadRepository {
  private readonly filePath: string;
  private writeQueue: Promise<unknown> = Promise.resolve();

  public constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'leads.json');
  }

  public async ensureReady(): Promise<void> {
    await ensureJsonArrayFile(this.filePath);
  }

  public async list(): Promise<StoredLead[]> {
    await this.ensureReady();
    const content = await readFile(this.filePath, 'utf-8');

    if (!content.trim()) {
      return [];
    }

    return JSON.parse(content) as StoredLead[];
  }

  public async upsert(
    lead: Omit<StoredLead, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<StoredLead> {
    return this.runSerialized(async () => {
      const leads = await this.list();
      const now = new Date().toISOString();

      const index = leads.findIndex((item) => {
        if (lead.lead_phone && item.lead_phone) {
          return item.lead_phone === lead.lead_phone;
        }

        if (lead.lead_email && item.lead_email) {
          return item.lead_email === lead.lead_email;
        }

        if (lead.lead_name && item.lead_name) {
          return item.lead_name.toLowerCase() === lead.lead_name.toLowerCase();
        }

        return false;
      });

      const nextRecord: StoredLead = index >= 0
        ? {
          ...leads[index],
          ...lead,
          updated_at: now,
        }
        : {
          id: randomUUID(),
          created_at: now,
          updated_at: now,
          ...lead,
        };

      if (index >= 0) {
        leads[index] = nextRecord;
      } else {
        leads.push(nextRecord);
      }

      await writeJsonAtomically(this.filePath, `${JSON.stringify(leads, null, 2)}\n`);
      return nextRecord;
    });
  }

  private async runSerialized<T>(operation: () => Promise<T>): Promise<T> {
    const nextOperation = this.writeQueue.then(operation, operation);
    this.writeQueue = nextOperation.then(() => undefined, () => undefined);
    return nextOperation;
  }
}
