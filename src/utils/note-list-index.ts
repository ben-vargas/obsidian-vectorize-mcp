import { Env, Note, NoteListEntry, NoteListIndex } from '../types';

const NOTE_LIST_INDEX_KEY = 'indexes/note-list.json';

function buildNoteListEntry(note: Pick<Note, 'path' | 'title' | 'tags' | 'createdAt' | 'modifiedAt'>): NoteListEntry {
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

async function readIndex(env: Env): Promise<NoteListIndex | null> {
  const existing = await env.R2.get(NOTE_LIST_INDEX_KEY);
  if (!existing) {
    return null;
  }

  return normalizeIndex(await existing.json());
}

async function writeIndex(env: Env, index: NoteListIndex): Promise<void> {
  index.updatedAt = new Date().toISOString();
  await env.R2.put(NOTE_LIST_INDEX_KEY, JSON.stringify(index));
}

export async function getOrRebuildNoteListIndex(env: Env): Promise<NoteListIndex> {
  const existing = await readIndex(env);
  if (existing) {
    return existing;
  }

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

  await writeIndex(env, rebuilt);
  return rebuilt;
}

export async function upsertNoteListEntries(
  env: Env,
  notes: Array<Pick<Note, 'path' | 'title' | 'tags' | 'createdAt' | 'modifiedAt'>>
): Promise<void> {
  if (notes.length === 0) {
    return;
  }

  const index = (await readIndex(env)) || (await getOrRebuildNoteListIndex(env));

  for (const note of notes) {
    index.notes[note.path] = buildNoteListEntry(note);
  }

  await writeIndex(env, index);
}

export async function removeNoteListEntries(env: Env, paths: string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  const index = (await readIndex(env)) || (await getOrRebuildNoteListIndex(env));

  for (const path of paths) {
    delete index.notes[path];
  }

  await writeIndex(env, index);
}
