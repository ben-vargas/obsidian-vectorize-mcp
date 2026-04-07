import { DurableObject } from 'cloudflare:workers';
import { Env, Note, NoteListEntry, NoteListIndex } from '../types';

const NOTE_LIST_INDEX_COORDINATOR_NAME = 'global';
const NOTE_LIST_INDEX_BASE_URL = 'https://note-list-index';
const LEGACY_INDEX_STORAGE_KEY = 'note-list-index';
const LEGACY_INDEX_INITIALIZED_KEY = 'note-list-index-initialized';
const INDEX_METADATA_KEY = 'note-list-index-meta';
const NOTE_ENTRY_KEY_PREFIX = 'note-list-entry:';
const NOTE_LIST_INDEX_BINDING_ERROR =
  'NOTE_LIST_INDEX Durable Object binding is missing. Update wrangler.toml from wrangler.toml.example or wrangler.toml.upgrade before using list_notes, /api/index, or /api/cleanup.';
const NOTE_LIST_INDEX_NOT_INITIALIZED_ERROR =
  'Note list index has not been initialized yet. Run your vault indexing flow again (for example `obvec index`) so list_notes can use the stored note metadata.';
const STORAGE_BATCH_SIZE = 100;

type NoteListEntryInput = Pick<Note, 'path' | 'title' | 'tags' | 'createdAt' | 'modifiedAt'>;
type NoteListIndexMetadata = Pick<NoteListIndex, 'version' | 'updatedAt'>;

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

function createIndexMetadata(updatedAt?: string): NoteListIndexMetadata {
  return {
    version: 1,
    updatedAt: updatedAt || new Date().toISOString()
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
    typeof candidate.updatedAt === 'string' ? candidate.updatedAt : undefined
  );
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
    throw new Error(message);
  }

  return await response.json() as T;
}

export async function getNoteListIndex(env: Env): Promise<NoteListIndex> {
  return readCoordinatorJson<NoteListIndex>(env, '/index');
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

export class NoteListIndexCoordinator extends DurableObject<Env> {
  private operationQueue: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/index') {
      const index = await this.runExclusive(async () => {
        return this.readInitializedIndex();
      });

      return Response.json(index);
    }

    if (request.method === 'POST' && url.pathname === '/upsert') {
      const { notes } = await request.json() as { notes?: NoteListEntryInput[] };

      if (!Array.isArray(notes)) {
        return new Response('Invalid request: notes array required', { status: 400 });
      }

      await this.runExclusive(async () => {
        await this.migrateLegacyIndexIfNeeded();
        for (let i = 0; i < notes.length; i += STORAGE_BATCH_SIZE) {
          const writes: Record<string, NoteListEntry> = {};
          for (const note of notes.slice(i, i + STORAGE_BATCH_SIZE)) {
            writes[getEntryStorageKey(note.path)] = buildNoteListEntry(note);
          }
          if (Object.keys(writes).length > 0) {
            await this.ctx.storage.put(writes);
          }
        }
        await this.ctx.storage.put(INDEX_METADATA_KEY, createIndexMetadata());
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
        if (!(await this.isInitialized())) {
          return;
        }

        const deleteKeys = paths.map(getEntryStorageKey);
        for (let i = 0; i < deleteKeys.length; i += STORAGE_BATCH_SIZE) {
          const chunk = deleteKeys.slice(i, i + STORAGE_BATCH_SIZE);
          if (chunk.length > 0) {
            await this.ctx.storage.delete(chunk);
          }
        }
        await this.ctx.storage.put(INDEX_METADATA_KEY, createIndexMetadata());
      });

      return Response.json({ success: true });
    }

    return new Response('Not found', { status: 404 });
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operationQueue.then(operation, operation);
    this.operationQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private async isInitialized(): Promise<boolean> {
    if (normalizeIndexMetadata(await this.ctx.storage.get<unknown>(INDEX_METADATA_KEY))) {
      return true;
    }

    if ((await this.ctx.storage.get<boolean>(LEGACY_INDEX_INITIALIZED_KEY)) !== true) {
      return false;
    }

    return normalizeIndex(await this.ctx.storage.get<unknown>(LEGACY_INDEX_STORAGE_KEY)) !== null;
  }

  private async readInitializedIndex(): Promise<NoteListIndex> {
    if (!(await this.isInitialized())) {
      throw new Error(NOTE_LIST_INDEX_NOT_INITIALIZED_ERROR);
    }

    return this.readStoredIndex();
  }

  private async readStoredIndex(): Promise<NoteListIndex> {
    await this.migrateLegacyIndexIfNeeded();

    const metadata = normalizeIndexMetadata(await this.ctx.storage.get<unknown>(INDEX_METADATA_KEY));
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

    await this.ctx.storage.put(INDEX_METADATA_KEY, createIndexMetadata(legacyIndex.updatedAt));
    await this.ctx.storage.delete([LEGACY_INDEX_STORAGE_KEY, LEGACY_INDEX_INITIALIZED_KEY]);
  }
}
