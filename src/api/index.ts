import { Env, Note } from '../types';
import { checkAuthAndRateLimit } from '../utils/auth';
import { generateEmbeddings } from '../utils/embeddings';
import { hashPath, calculateChecksum } from '../utils/hash';
import { sanitizePath } from '../utils/security';

export async function handleIndex(request: Request, env: Env): Promise<Response> {
  // Check authorization and rate limit
  if (!(await checkAuthAndRateLimit(request, env))) {
    return new Response('Unauthorized or rate limit exceeded', { status: 401 });
  }
  
  try {
    const { notes } = await request.json() as { notes: Note[] };
    
    if (!notes || !Array.isArray(notes)) {
      return new Response('Invalid request: notes array required', { status: 400 });
    }
    
    // Process notes in batches
    const batchSize = 10;
    let totalIndexed = 0;
    
    for (let i = 0; i < notes.length; i += batchSize) {
      const batch = notes.slice(i, i + batchSize);
      const texts = batch.map(note => `${note.title}\n\n${note.content}`);
      
      // Generate embeddings
      const embeddingVectors = await generateEmbeddings(texts, env);
      
      // Build embeddings for this batch only
      const batchEmbeddings = [];
      
      // Store in Vectorize with metadata
      for (let j = 0; j < batch.length; j++) {
        const note = batch[j];
        const embedding = embeddingVectors[j];
        
        // Validate and sanitize the path
        try {
          note.path = sanitizePath(note.path);
        } catch (error) {
          console.error(`Invalid path for note: ${note.path}`);
          continue; // Skip this note
        }
        
        // Generate a short ID from the path
        const shortId = await hashPath(note.path);
        
        batchEmbeddings.push({
          id: shortId,
          values: embedding,
          metadata: {
            path: note.path,
            title: note.title,
            content: note.content.substring(0, 1000), // Store first 1000 chars
            tags: note.tags,
            createdAt: note.createdAt || '',
            modifiedAt: note.modifiedAt || '',
            ...note.frontmatter
          }
        });
      }
      
      // Upsert this batch immediately to free memory
      if (batchEmbeddings.length > 0) {
        await env.VECTORIZE.upsert(batchEmbeddings);
        totalIndexed += batchEmbeddings.length;
      }
    }
    
    // Store metadata in R2 for full content (only if changed)
    let r2Updated = 0;
    let r2Skipped = 0;
    
    for (const note of notes) {
      // Validate path before creating R2 key
      let validatedPath;
      try {
        validatedPath = sanitizePath(note.path);
      } catch (error) {
        console.error(`Skipping note with invalid path: ${note.path}`);
        r2Skipped++;
        continue;
      }
      
      const r2Key = `notes/${validatedPath}`;
      
      // Calculate checksum of the note content
      const noteContent = JSON.stringify(note);
      const checksum = await calculateChecksum(noteContent);
      
      // Check if file exists and compare checksum
      const existingObject = await env.R2.head(r2Key);
      const existingChecksum = existingObject?.customMetadata?.checksum;
      
      if (existingChecksum !== checksum) {
        // File is new or changed, upload it
        await env.R2.put(r2Key, noteContent, {
          customMetadata: { checksum }
        });
        r2Updated++;
      } else {
        // File unchanged, skip upload
        r2Skipped++;
      }
    }
    
    return new Response(JSON.stringify({
      success: true,
      indexed: totalIndexed,
      r2Updated,
      r2Skipped,
      message: `Successfully indexed ${totalIndexed} notes (R2: ${r2Updated} updated, ${r2Skipped} unchanged)`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('Indexing error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}