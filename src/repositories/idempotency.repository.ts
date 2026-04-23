import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { CreateMeetingResult, IdempotencyRecord, IdempotencyStatus } from '../types';

type IdempotencyStore = Record<string, IdempotencyRecord | LegacyIdempotencyRecord>;

interface LegacyIdempotencyRecord {
  key: string;
  created_at: string;
  response: {
    calendar_event_id: string;
    calendar_event_link: string | null;
    meeting_datetime_iso: string;
    timezone: string;
  };
}

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

function createLegacyResponse(record: LegacyIdempotencyRecord): CreateMeetingResult {
  const meetingDateTimeIso = record.response.meeting_datetime_iso;
  const preferredDate = meetingDateTimeIso.slice(0, 10);
  const timeFragment = meetingDateTimeIso.split('T')[1]?.slice(0, 5) ?? 'horario_confirmado';

  return {
    meeting_booked: true,
    calendar_event_id: record.response.calendar_event_id,
    calendar_event_link: record.response.calendar_event_link,
    meeting_datetime_iso: meetingDateTimeIso,
    timezone: record.response.timezone,
    preferred_date: preferredDate,
    preferred_time_range: `${timeFragment}-${timeFragment}`,
    requested_meeting: true,
    lead_status: 'reunion_agendada',
    lead_id: null,
    conversation_id: null,
    external_conversation_id: null,
    idempotency: {
      reused: true,
      key: record.key,
    },
  };
}

function normalizeRecord(key: string, record: IdempotencyRecord | LegacyIdempotencyRecord | null): IdempotencyRecord | null {
  if (!record) {
    return null;
  }

  if ('status' in record) {
    return {
      ...record,
      key,
    };
  }

  const createdAt = record.created_at;

  return {
    key,
    tool: 'create_meeting',
    status: 'succeeded',
    fingerprint: null,
    created_at: createdAt,
    updated_at: createdAt,
    started_at: createdAt,
    finished_at: createdAt,
    lock_expires_at: null,
    lead_id: null,
    conversation_id: null,
    external_conversation_id: null,
    calendar_event_id: record.response.calendar_event_id,
    response: createLegacyResponse(record),
    error: null,
  };
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
    return normalizeRecord(key, store[key] ?? null);
  }

  public async beginExecution(input: {
    key: string;
    fingerprint: string | null;
    lead_id: string | null;
    conversation_id: string | null;
    external_conversation_id: string | null;
    lockTtlMs: number;
  }): Promise<{ acquired: boolean; record: IdempotencyRecord }> {
    return this.runSerialized(async () => {
      await this.ensureReady();
      const content = await readFile(this.filePath, 'utf-8');
      const store = (content.trim() ? JSON.parse(content) : {}) as IdempotencyStore;
      const now = new Date();
      const nowIso = now.toISOString();
      const existing = normalizeRecord(input.key, store[input.key] ?? null);

      if (existing?.status === 'succeeded' && existing.response) {
        return {
          acquired: false,
          record: existing,
        };
      }

      if (existing?.status === 'in_progress' && existing.lock_expires_at) {
        const lockExpiresAt = new Date(existing.lock_expires_at).getTime();

        if (!Number.isNaN(lockExpiresAt) && lockExpiresAt > now.getTime()) {
          return {
            acquired: false,
            record: existing,
          };
        }
      }

      const nextRecord: IdempotencyRecord = {
        key: input.key,
        tool: 'create_meeting',
        status: 'in_progress',
        fingerprint: input.fingerprint ?? existing?.fingerprint ?? null,
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
        started_at: nowIso,
        finished_at: null,
        lock_expires_at: new Date(now.getTime() + input.lockTtlMs).toISOString(),
        lead_id: input.lead_id ?? existing?.lead_id ?? null,
        conversation_id: input.conversation_id ?? existing?.conversation_id ?? null,
        external_conversation_id: input.external_conversation_id ?? existing?.external_conversation_id ?? null,
        calendar_event_id: existing?.calendar_event_id ?? null,
        response: existing?.response ?? null,
        error: null,
      };

      store[input.key] = nextRecord;
      await writeJsonAtomically(this.filePath, `${JSON.stringify(store, null, 2)}\n`);

      return {
        acquired: true,
        record: nextRecord,
      };
    });
  }

  public async completeSuccess(input: {
    key: string;
    response: CreateMeetingResult;
  }): Promise<IdempotencyRecord> {
    return this.runSerialized(async () => {
      await this.ensureReady();
      const content = await readFile(this.filePath, 'utf-8');
      const store = (content.trim() ? JSON.parse(content) : {}) as IdempotencyStore;
      const existing = normalizeRecord(input.key, store[input.key] ?? null);
      const nowIso = new Date().toISOString();

      const record: IdempotencyRecord = {
        key: input.key,
        tool: 'create_meeting',
        status: 'succeeded',
        fingerprint: existing?.fingerprint ?? null,
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
        started_at: existing?.started_at ?? nowIso,
        finished_at: nowIso,
        lock_expires_at: null,
        lead_id: input.response.lead_id,
        conversation_id: input.response.conversation_id,
        external_conversation_id: input.response.external_conversation_id,
        calendar_event_id: input.response.calendar_event_id,
        response: input.response,
        error: null,
      };

      store[input.key] = record;
      await writeJsonAtomically(this.filePath, `${JSON.stringify(store, null, 2)}\n`);
      return record;
    });
  }

  public async completeFailure(input: {
    key: string;
    message: string;
    statusCode: number | null;
    retryable: boolean;
  }): Promise<IdempotencyRecord> {
    return this.runSerialized(async () => {
      await this.ensureReady();
      const content = await readFile(this.filePath, 'utf-8');
      const store = (content.trim() ? JSON.parse(content) : {}) as IdempotencyStore;
      const existing = normalizeRecord(input.key, store[input.key] ?? null);
      const nowIso = new Date().toISOString();
      const status: IdempotencyStatus = input.retryable ? 'failed_retryable' : 'failed_final';

      const record: IdempotencyRecord = {
        key: input.key,
        tool: 'create_meeting',
        status,
        fingerprint: existing?.fingerprint ?? null,
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
        started_at: existing?.started_at ?? nowIso,
        finished_at: nowIso,
        lock_expires_at: null,
        lead_id: existing?.lead_id ?? null,
        conversation_id: existing?.conversation_id ?? null,
        external_conversation_id: existing?.external_conversation_id ?? null,
        calendar_event_id: existing?.calendar_event_id ?? null,
        response: existing?.response ?? null,
        error: {
          message: input.message,
          status_code: input.statusCode,
        },
      };

      store[input.key] = record;
      await writeJsonAtomically(this.filePath, `${JSON.stringify(store, null, 2)}\n`);
      return record;
    });
  }

  private async runSerialized<T>(operation: () => Promise<T>): Promise<T> {
    const nextOperation = this.writeQueue.then(operation, operation);
    this.writeQueue = nextOperation.then(() => undefined, () => undefined);
    return nextOperation;
  }
}
