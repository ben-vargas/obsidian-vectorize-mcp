import { DurableObject } from 'cloudflare:workers';
import { Env, Note, NoteListEntry, NoteListIndex } from '../types';

const NOTE_LIST_INDEX_COORDINATOR_NAME = 'global';
const NOTE_LIST_INDEX_BASE_URL = 'https://note-list-index';
const INDEX_STORAGE_KEY = 'note-list-index';
const INDEX_INITIALIZED_KEY = 'note-list-index-initialized';

type NoteListEntryInput = Pick<Note, 'path' | 'title' | 'tags' | 'createdAt' | 'modifiedAt'>;

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

async function rebuildIndexFromR2(env: Env): Promise<NoteListIndex> {
  const rebuilt = createEmptyIndex();
  let cursor: string | undefined;
  let truncated = false;

  do {
    const listed = await env.R2.list({
      prefix: 'notes/',
      limit: 1000,
      cursor
    });

    for (const object of listed.objects) {
      const noteObject = await env.R2.get(object.key);
      if (!noteObject) {
        continue;
      }

      try {
        const note = await noteObject.json() as Partial<Note>;
        const path = object.key.replace('notes/', '');
        rebuilt.notes[path] = buildNoteListEntry({
          path,
          title: note.title || '',
          tags: Array.isArray(note.tags) ? note.tags : [],
          createdAt: note.createdAt,
          modifiedAt: note.modifiedAt
        });
      } catch {
        continue;
      }
    }

    truncated = listed.truncated;
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (truncated);

  rebuilt.updatedAt = new Date().toISOString();
  return rebuilt;
}

function getCoordinatorStub(env: Env): DurableObjectStub {
  return env.NOTE_LIST_INDEX.get(env.NOTE_LIST_INDEX.idFromName(NOTE_LIST_INDEX_COORDINATOR_NAME));
}

async function readCoordinatorJson<T>(env: Env, path: string, init?: RequestInit): Promise<T> {
  const response = await getCoordinatorStub(env).fetch(`${NOTE_LIST_INDEX_BASE_URL}${path}`, init);

  if (!response.ok) {
    throw new Error(`Note list coordinator request failed: ${response.status} ${response.statusText}`);
  }

  return await response.json() as T;
}

export async function getOrRebuildNoteListIndex(env: Env): Promise<NoteListIndex> {
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
        await this.ensureInitialized();
        return this.readStoredIndex();
      });

      return Response.json(index);
    }

    if (request.method === 'POST' && url.pathname === '/upsert') {
      const { notes } = await request.json() as { notes?: NoteListEntryInput[] };

      if (!Array.isArray(notes)) {
        return new Response('Invalid request: notes array required', { status: 400 });
      }

      await this.runExclusive(async () => {
        await this.ensureInitialized();
        const index = await this.readStoredIndex();

        for (const note of notes) {
          index.notes[note.path] = buildNoteListEntry(note);
        }

        await this.writeStoredIndex(index);
      });

      return Response.json({ success: true });
    }

    if (request.method === 'POST' && url.pathname === '/remove') {
      const { paths } = await request.json() as { paths?: string[] };

      if (!Array.isArray(paths)) {
        return new Response('Invalid request: paths array required', { status: 400 });
      }

      await this.runExclusive(async () => {
        await this.ensureInitialized();
        const index = await this.readStoredIndex();

        for (const path of paths) {
          delete index.notes[path];
        }

        await this.writeStoredIndex(index);
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

  private async ensureInitialized(): Promise<void> {
    const initialized = await this.ctx.storage.get<boolean>(INDEX_INITIALIZED_KEY);
    if (initialized) {
      return;
    }

    const rebuilt = await rebuildIndexFromR2(this.env);
    await this.writeStoredIndex(rebuilt);
  }

  private async readStoredIndex(): Promise<NoteListIndex> {
    const stored = await this.ctx.storage.get<unknown>(INDEX_STORAGE_KEY);
    return normalizeIndex(stored) || createEmptyIndex();
  }

  private async writeStoredIndex(index: NoteListIndex): Promise<void> {
    index.updatedAt = new Date().toISOString();
    await this.ctx.storage.put({
      [INDEX_STORAGE_KEY]: index,
      [INDEX_INITIALIZED_KEY]: true
    });
  }
}
