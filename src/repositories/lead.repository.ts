import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { LeadLookupInput, StoredLead } from '../types';

type LeadUpsertInput = Omit<StoredLead, 'id' | 'created_at' | 'updated_at'> & {
  lead_id?: string | null;
};

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

  public async findByIdentifiers(criteria: LeadLookupInput): Promise<StoredLead | null> {
    const leads = await this.list();
    return this.findMatchingLead(leads, criteria);
  }

  public async upsert(lead: LeadUpsertInput): Promise<StoredLead> {
    return this.runSerialized(async () => {
      const leads = await this.list();
      const now = new Date().toISOString();
      const { lead_id, ...recordInput } = lead;
      const existingLead = this.findMatchingLead(leads, {
        lead_id,
        conversation_id: recordInput.conversation_id,
        external_conversation_id: recordInput.external_conversation_id,
        lead_phone: recordInput.lead_phone,
        lead_email: recordInput.lead_email,
      });
      const index = existingLead ? leads.findIndex((item) => item.id === existingLead.id) : -1;

      const nextRecord: StoredLead = index >= 0
        ? {
          ...leads[index],
          ...recordInput,
          updated_at: now,
        }
        : {
          id: lead_id ?? randomUUID(),
          created_at: now,
          updated_at: now,
          ...recordInput,
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

  private findMatchingLead(leads: StoredLead[], criteria: LeadLookupInput): StoredLead | null {
    if (criteria.lead_id) {
      return leads.find((item) => item.id === criteria.lead_id) ?? null;
    }

    if (criteria.conversation_id) {
      const byConversationId = leads.filter((item) => item.conversation_id === criteria.conversation_id);

      if (byConversationId.length === 1) {
        return byConversationId[0];
      }
    }

    if (criteria.external_conversation_id) {
      const byExternalConversationId = leads.filter(
        (item) => item.external_conversation_id === criteria.external_conversation_id,
      );

      if (byExternalConversationId.length === 1) {
        return byExternalConversationId[0];
      }
    }

    if (criteria.lead_phone && criteria.lead_email) {
      const byPhoneAndEmail = leads.filter(
        (item) => item.lead_phone === criteria.lead_phone && item.lead_email === criteria.lead_email,
      );

      if (byPhoneAndEmail.length === 1) {
        return byPhoneAndEmail[0];
      }
    }

    if (criteria.lead_phone) {
      const byPhone = leads.filter((item) => item.lead_phone === criteria.lead_phone);

      if (byPhone.length === 1) {
        return byPhone[0];
      }
    }

    if (criteria.lead_email) {
      const byEmail = leads.filter((item) => item.lead_email === criteria.lead_email);

      if (byEmail.length === 1) {
        return byEmail[0];
      }
    }

    return null;
  }

  private async runSerialized<T>(operation: () => Promise<T>): Promise<T> {
    const nextOperation = this.writeQueue.then(operation, operation);
    this.writeQueue = nextOperation.then(() => undefined, () => undefined);
    return nextOperation;
  }
}
