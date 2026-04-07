import { DurableObject } from 'cloudflare:workers';
import { Env, Note, NoteListEntry, NoteListIndex } from '../types';

const NOTE_LIST_INDEX_COORDINATOR_NAME = 'global';
const NOTE_LIST_INDEX_BASE_URL = 'https://note-list-index';
const LEGACY_INDEX_STORAGE_KEY = 'note-list-index';
const LEGACY_INDEX_INITIALIZED_KEY = 'note-list-index-initialized';
const INDEX_METADATA_KEY = 'note-list-index-meta';
const NOTE_ENTRY_KEY_PREFIX = 'note-list-entry:';
const BACKFILL_STATE_KEY = 'note-list-index-backfill-state';
const NOTE_LIST_INDEX_BINDING_ERROR =
  'NOTE_LIST_INDEX Durable Object binding is missing. Update wrangler.toml from wrangler.toml.example or wrangler.toml.upgrade before using list_notes, /api/index, or /api/cleanup.';
const NOTE_LIST_INDEX_NOT_INITIALIZED_ERROR =
  'Note list index has not been initialized yet. Run your vault indexing flow again (for example `obvec index`) so list_notes can use the stored note metadata.';
const NOTE_LIST_INDEX_NOT_INITIALIZED_STATUS = 409;
const STORAGE_BATCH_SIZE = 100;
const R2_FETCH_CONCURRENCY = 20;

type NoteListEntryInput = Pick<Note, 'path' | 'title' | 'tags' | 'createdAt' | 'modifiedAt'>;
type NoteListIndexMetadata = Pick<NoteListIndex, 'version' | 'updatedAt'> & {
  ready?: boolean;
};
type NoteListBackfillState = {
  cursor?: string;
};

function buildNoteListEntry(note: NoteListEntryInput): NoteListEntry {
  return {
    path: note.path,
    title: note.title || note.path.split('/').pop()?.replace('.md', '') || 'Untitled',
    tags: Array.isArray(note.tags) ? note.tags : [],
    createdAt: note.createdAt,
    modifiedAt: note.modifiedAt
  };
}

function createEmptyIndex(): NoteListIndex {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    notes: {}
  };
}

function normalizeIndex(data: unknown): NoteListIndex | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const raw = data as Partial<NoteListIndex>;
  const rawNotes = raw.notes;

  if (raw.version !== 1 || !rawNotes || typeof rawNotes !== 'object') {
    return null;
  }

  const notes: Record<string, NoteListEntry> = {};

  for (const [path, entry] of Object.entries(rawNotes)) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const candidate = entry as Partial<NoteListEntry>;
    notes[path] = {
      path,
      title: typeof candidate.title === 'string' && candidate.title.length > 0
        ? candidate.title
        : path.split('/').pop()?.replace('.md', '') || 'Untitled',
      tags: Array.isArray(candidate.tags) ? candidate.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : undefined,
      modifiedAt: typeof candidate.modifiedAt === 'string' ? candidate.modifiedAt : undefined
    };
  }

  return {
    version: 1,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    notes
  };
}

function createIndexMetadata(options?: { updatedAt?: string; ready?: boolean }): NoteListIndexMetadata {
  return {
    version: 1,
    updatedAt: options?.updatedAt || new Date().toISOString(),
    ready: options?.ready
  };
}

function getEntryStorageKey(path: string): string {
  return `${NOTE_ENTRY_KEY_PREFIX}${path}`;
}

function getPathFromEntryStorageKey(key: string): string {
  return key.slice(NOTE_ENTRY_KEY_PREFIX.length);
}

function normalizeNoteListEntry(path: string, data: unknown): NoteListEntry | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const candidate = data as Partial<NoteListEntry>;
  return {
    path,
    title: typeof candidate.title === 'string' && candidate.title.length > 0
      ? candidate.title
      : path.split('/').pop()?.replace('.md', '') || 'Untitled',
    tags: Array.isArray(candidate.tags) ? candidate.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : undefined,
    modifiedAt: typeof candidate.modifiedAt === 'string' ? candidate.modifiedAt : undefined
  };
}

function normalizeIndexMetadata(data: unknown): NoteListIndexMetadata | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const candidate = data as Partial<NoteListIndexMetadata>;
  if (candidate.version !== 1) {
    return null;
  }

  return createIndexMetadata(
    {
      updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : undefined,
      ready: typeof candidate.ready === 'boolean' ? candidate.ready : undefined
    }
  );
}

function normalizeBackfillState(data: unknown): NoteListBackfillState | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const candidate = data as Partial<NoteListBackfillState>;
  return {
    cursor: typeof candidate.cursor === 'string' && candidate.cursor.length > 0 ? candidate.cursor : undefined
  };
}

function isNoteListIndexUninitializedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { message?: unknown; status?: unknown };
  return candidate.status === NOTE_LIST_INDEX_NOT_INITIALIZED_STATUS ||
    (typeof candidate.message === 'string' &&
      candidate.message.includes(NOTE_LIST_INDEX_NOT_INITIALIZED_ERROR));
}

async function buildIndexFromR2(env: Env): Promise<NoteListIndex> {
  const index = createEmptyIndex();
  let cursor: string | undefined;
  let truncated = false;

  do {
    const listed = await env.R2.list({
      prefix: 'notes/',
      limit: 1000,
      cursor
    });

    for (let i = 0; i < listed.objects.length; i += R2_FETCH_CONCURRENCY) {
      const batch = listed.objects.slice(i, i + R2_FETCH_CONCURRENCY);
      const entries = await Promise.all(batch.map(async (object) => {
        const noteObject = await env.R2.get(object.key);
        if (!noteObject) {
          return null;
        }

        try {
          const note = await noteObject.json() as Partial<Note>;
          const path = object.key.replace('notes/', '');
          return [path, buildNoteListEntry({
            path,
            title: note.title || '',
            tags: Array.isArray(note.tags) ? note.tags : [],
            createdAt: note.createdAt,
            modifiedAt: note.modifiedAt
          })] as const;
        } catch {
          return null;
        }
      }));

      for (const entry of entries) {
        if (!entry) {
          continue;
        }

        const [path, noteEntry] = entry;
        index.notes[path] = noteEntry;
      }
    }

    truncated = listed.truncated;
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (truncated);

  index.updatedAt = new Date().toISOString();
  return index;
}

export function assertNoteListIndexConfigured(env: Env): void {
  if (!env.NOTE_LIST_INDEX) {
    throw new Error(NOTE_LIST_INDEX_BINDING_ERROR);
  }
}

function getCoordinatorStub(env: Env): DurableObjectStub {
  assertNoteListIndexConfigured(env);
  return env.NOTE_LIST_INDEX.get(env.NOTE_LIST_INDEX.idFromName(NOTE_LIST_INDEX_COORDINATOR_NAME));
}

async function readCoordinatorJson<T>(env: Env, path: string, init?: RequestInit): Promise<T> {
  const response = await getCoordinatorStub(env).fetch(`${NOTE_LIST_INDEX_BASE_URL}${path}`, init);

  if (!response.ok) {
    const message = (await response.text()) || `${response.status} ${response.statusText}`;
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return await response.json() as T;
}

export async function getNoteListIndex(env: Env): Promise<NoteListIndex> {
  try {
    return await readCoordinatorJson<NoteListIndex>(env, '/index');
  } catch (error: any) {
    if (!isNoteListIndexUninitializedError(error)) {
      throw error;
    }

    try {
      await startNoteListIndexBackfill(env);
    } catch (backfillError) {
      console.error('Failed to start note list index backfill:', backfillError);
    }

    return buildIndexFromR2(env);
  }
}

export async function upsertNoteListEntries(env: Env, notes: NoteListEntryInput[]): Promise<void> {
  if (notes.length === 0) {
    return;
  }

  await readCoordinatorJson<{ success: true }>(env, '/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes })
  });
}

export async function removeNoteListEntries(env: Env, paths: string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  await readCoordinatorJson<{ success: true }>(env, '/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths })
  });
}

async function startNoteListIndexBackfill(env: Env): Promise<void> {
  await readCoordinatorJson<{ success: true }>(env, '/backfill', {
    method: 'POST'
  });
}

export class NoteListIndexCoordinator extends DurableObject<Env> {
  private operationQueue: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/index') {
      try {
        const index = await this.runExclusive(async () => {
          return this.readInitializedIndex();
        });

        return Response.json(index);
      } catch (error) {
        if (isNoteListIndexUninitializedError(error)) {
          return new Response(NOTE_LIST_INDEX_NOT_INITIALIZED_ERROR, {
            status: NOTE_LIST_INDEX_NOT_INITIALIZED_STATUS
          });
        }
        throw error;
      }
    }

    if (request.method === 'POST' && url.pathname === '/upsert') {
      const { notes } = await request.json() as { notes?: NoteListEntryInput[] };

      if (!Array.isArray(notes)) {
        return new Response('Invalid request: notes array required', { status: 400 });
      }

      await this.runExclusive(async () => {
        await this.migrateLegacyIndexIfNeeded();
        const metadata = await this.readIndexMetadata();
        const backfillInProgress = await this.hasBackfillState();
        const isReady = this.metadataIsReady(metadata, backfillInProgress);

        for (let i = 0; i < notes.length; i += STORAGE_BATCH_SIZE) {
          const writes: Record<string, NoteListEntry> = {};
          for (const note of notes.slice(i, i + STORAGE_BATCH_SIZE)) {
            writes[getEntryStorageKey(note.path)] = buildNoteListEntry(note);
          }
          if (Object.keys(writes).length > 0) {
            await this.ctx.storage.put(writes);
          }
        }
        await this.writeIndexMetadata(isReady);
      });

      return Response.json({ success: true });
    }

    if (request.method === 'POST' && url.pathname === '/remove') {
      const { paths } = await request.json() as { paths?: string[] };

      if (!Array.isArray(paths)) {
        return new Response('Invalid request: paths array required', { status: 400 });
      }

      await this.runExclusive(async () => {
        await this.migrateLegacyIndexIfNeeded();
        const metadata = await this.readIndexMetadata();
        const backfillInProgress = await this.hasBackfillState();
        const isReady = this.metadataIsReady(metadata, backfillInProgress);
        const deleteKeys = paths.map(getEntryStorageKey);
        for (let i = 0; i < deleteKeys.length; i += STORAGE_BATCH_SIZE) {
          const chunk = deleteKeys.slice(i, i + STORAGE_BATCH_SIZE);
          if (chunk.length > 0) {
            await this.ctx.storage.delete(chunk);
          }
        }
        if (metadata || backfillInProgress) {
          await this.writeIndexMetadata(isReady);
        }
      });

      return Response.json({ success: true });
    }

    if (request.method === 'POST' && url.pathname === '/backfill') {
      await this.runExclusive(async () => {
        await this.scheduleBackfill();
      });

      return Response.json({ success: true });
    }

    return new Response('Not found', { status: 404 });
  }

  override async alarm(): Promise<void> {
    await this.runExclusive(async () => {
      await this.processBackfillChunk();
    });
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operationQueue.then(operation, operation);
    this.operationQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private async isInitialized(): Promise<boolean> {
    const metadata = await this.readIndexMetadata();
    if (metadata) {
      return this.metadataIsReady(metadata, await this.hasBackfillState());
    }

    if ((await this.ctx.storage.get<boolean>(LEGACY_INDEX_INITIALIZED_KEY)) !== true) {
      return false;
    }

    return normalizeIndex(await this.ctx.storage.get<unknown>(LEGACY_INDEX_STORAGE_KEY)) !== null;
  }

  private async scheduleBackfill(): Promise<void> {
    await this.migrateLegacyIndexIfNeeded();
    if (await this.isInitialized()) {
      return;
    }

    const backfillState = normalizeBackfillState(await this.ctx.storage.get<unknown>(BACKFILL_STATE_KEY));
    if (!backfillState) {
      await this.ctx.storage.put(BACKFILL_STATE_KEY, { cursor: undefined });
    }

    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null) {
      await this.ctx.storage.setAlarm(Date.now());
    }
  }

  private async readInitializedIndex(): Promise<NoteListIndex> {
    if (!(await this.isInitialized())) {
      throw new Error(NOTE_LIST_INDEX_NOT_INITIALIZED_ERROR);
    }

    return this.readStoredIndex();
  }

  private async readStoredIndex(): Promise<NoteListIndex> {
    await this.migrateLegacyIndexIfNeeded();

    const metadata = await this.readIndexMetadata();
    if (!metadata) {
      return createEmptyIndex();
    }

    const storedEntries = await this.ctx.storage.list<unknown>({ prefix: NOTE_ENTRY_KEY_PREFIX });
    const notes: Record<string, NoteListEntry> = {};

    for (const [key, value] of storedEntries.entries()) {
      const path = getPathFromEntryStorageKey(key);
      const entry = normalizeNoteListEntry(path, value);
      if (entry) {
        notes[path] = entry;
      }
    }

    return {
      version: metadata.version,
      updatedAt: metadata.updatedAt,
      notes
    };
  }

  private async readIndexMetadata(): Promise<NoteListIndexMetadata | null> {
    return normalizeIndexMetadata(await this.ctx.storage.get<unknown>(INDEX_METADATA_KEY));
  }

  private async hasBackfillState(): Promise<boolean> {
    return normalizeBackfillState(await this.ctx.storage.get<unknown>(BACKFILL_STATE_KEY)) !== null;
  }

  private metadataIsReady(metadata: NoteListIndexMetadata | null, backfillInProgress: boolean): boolean {
    if (!metadata) {
      return false;
    }

    if (backfillInProgress) {
      return false;
    }

    return metadata.ready !== false;
  }

  private async writeIndexMetadata(ready: boolean, updatedAt?: string): Promise<void> {
    await this.ctx.storage.put(
      INDEX_METADATA_KEY,
      createIndexMetadata({ updatedAt, ready })
    );
  }

  private async migrateLegacyIndexIfNeeded(): Promise<void> {
    if (normalizeIndexMetadata(await this.ctx.storage.get<unknown>(INDEX_METADATA_KEY))) {
      return;
    }

    if ((await this.ctx.storage.get<boolean>(LEGACY_INDEX_INITIALIZED_KEY)) !== true) {
      return;
    }

    const legacyIndex = normalizeIndex(await this.ctx.storage.get<unknown>(LEGACY_INDEX_STORAGE_KEY));
    if (!legacyIndex) {
      return;
    }

    const entries = Object.entries(legacyIndex.notes);
    for (let i = 0; i < entries.length; i += STORAGE_BATCH_SIZE) {
      const chunkWrites: Record<string, NoteListEntry> = {};
      for (const [path, entry] of entries.slice(i, i + STORAGE_BATCH_SIZE)) {
        chunkWrites[getEntryStorageKey(path)] = entry;
      }
      if (Object.keys(chunkWrites).length > 0) {
        await this.ctx.storage.put(chunkWrites);
      }
    }

    await this.writeIndexMetadata(true, legacyIndex.updatedAt);
    await this.ctx.storage.delete([LEGACY_INDEX_STORAGE_KEY, LEGACY_INDEX_INITIALIZED_KEY]);
  }

  private async processBackfillChunk(): Promise<void> {
    await this.migrateLegacyIndexIfNeeded();
    if (await this.isInitialized()) {
      await this.ctx.storage.delete(BACKFILL_STATE_KEY);
      return;
    }

    const backfillState = normalizeBackfillState(await this.ctx.storage.get<unknown>(BACKFILL_STATE_KEY)) || {};
    const listed = await this.env.R2.list({
      prefix: 'notes/',
      limit: STORAGE_BATCH_SIZE,
      cursor: backfillState.cursor
    });

    const writes: Record<string, NoteListEntry> = {};

    for (let i = 0; i < listed.objects.length; i += R2_FETCH_CONCURRENCY) {
      const batch = listed.objects.slice(i, i + R2_FETCH_CONCURRENCY);
      const entries = await Promise.all(batch.map(async (object) => {
        const noteObject = await this.env.R2.get(object.key);
        if (!noteObject) {
          return null;
        }

        try {
          const note = await noteObject.json() as Partial<Note>;
          const path = object.key.replace('notes/', '');
          return [getEntryStorageKey(path), buildNoteListEntry({
            path,
            title: note.title || '',
            tags: Array.isArray(note.tags) ? note.tags : [],
            createdAt: note.createdAt,
            modifiedAt: note.modifiedAt
          })] as const;
        } catch {
          return null;
        }
      }));

      for (const entry of entries) {
        if (!entry) {
          continue;
        }

        const [key, noteEntry] = entry;
        writes[key] = noteEntry;
      }
    }

    if (Object.keys(writes).length > 0) {
      await this.ctx.storage.put(writes);
    }

    if (listed.truncated) {
      await this.ctx.storage.put(BACKFILL_STATE_KEY, { cursor: listed.cursor });
      await this.ctx.storage.setAlarm(Date.now());
      return;
    }

    await this.writeIndexMetadata(true);
    await this.ctx.storage.delete(BACKFILL_STATE_KEY);
  }
}
