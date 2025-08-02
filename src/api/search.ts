import { Env, SearchResult } from '../types';
import { checkAuthHeader } from '../utils/auth';
import { generateEmbedding } from '../utils/embeddings';

export async function handleSearch(request: Request, env: Env): Promise<Response> {
  // Check authorization
  if (!checkAuthHeader(request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  try {
    const { query, limit = 10, returnContent = false } = await request.json() as { 
      query: string; 
      limit?: number;
      returnContent?: boolean;
    };
    
    if (!query) {
      return new Response('Query required', { status: 400 });
    }
    
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query, env);
    
    // Search vectorize
    const results = await env.VECTORIZE.query(queryEmbedding, {
      topK: Math.min(limit, 50),
      returnMetadata: true
    });
    
    // Format results
    const formattedResults: SearchResult[] = await Promise.all(results.matches.map(async match => {
      const metadata = match.metadata as any;
      const result: SearchResult = {
        score: match.score,
        title: metadata.title,
        path: metadata.path,
        tags: metadata.tags,
        preview: metadata.content?.substring(0, 200)
      };
      
      // Optionally include full content
      if (returnContent) {
        try {
          const r2Object = await env.R2.get(`notes/${metadata.path}`);
          if (r2Object) {
            const noteData = await r2Object.json() as any;
            result.content = noteData.content;
          }
        } catch (e) {
          // Ignore R2 errors
        }
      }
      
      return result;
    }));
    
    return new Response(JSON.stringify({
      query,
      results: formattedResults,
      count: formattedResults.length
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}