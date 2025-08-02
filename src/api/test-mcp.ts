import { Env } from '../types';
import { generateEmbedding } from '../utils/embeddings';
import { checkAuthHeader } from '../utils/auth';

export async function handleTestMCP(request: Request, env: Env): Promise<Response> {
  // Check authorization
  if (!checkAuthHeader(request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  try {
    // Test 1: Check bindings
    const bindings = {
      AI: !!env.AI,
      VECTORIZE: !!env.VECTORIZE,
      MCP_OBJECT: !!env.MCP_OBJECT,
      EMBEDDING_MODEL: env.EMBEDDING_MODEL,
      EMBEDDING_DIMENSIONS: env.EMBEDDING_DIMENSIONS
    };
    
    // Test 2: Try to generate embedding
    let embeddingTest = { success: false, error: '', length: 0 };
    try {
      const testEmbedding = await generateEmbedding("test query", env);
      embeddingTest = {
        success: true,
        error: '',
        length: testEmbedding.length
      };
    } catch (error: any) {
      embeddingTest = {
        success: false,
        error: error.message,
        length: 0
      };
    }
    
    // Test 3: Try to query Vectorize
    let vectorizeTest = { success: false, error: '', count: 0 };
    try {
      const dummyVector = new Array(1024).fill(0);
      const results = await env.VECTORIZE.query(dummyVector, { topK: 1 });
      vectorizeTest = {
        success: true,
        error: '',
        count: results.matches.length
      };
    } catch (error: any) {
      vectorizeTest = {
        success: false,
        error: error.message,
        count: 0
      };
    }
    
    return new Response(JSON.stringify({
      bindings,
      embeddingTest,
      vectorizeTest,
      timestamp: new Date().toISOString()
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}