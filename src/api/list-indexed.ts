import { Env } from '../types';
import { checkAuthAndRateLimit } from '../utils/auth';

export async function handleListIndexed(request: Request, env: Env): Promise<Response> {
  // Check authorization and rate limit
  if (!(await checkAuthAndRateLimit(request, env))) {
    return new Response('Unauthorized or rate limit exceeded', { status: 401 });
  }
  
  try {
    // List all objects in R2 notes/ prefix with pagination
    const files: string[] = [];
    let cursor: string | undefined;
    let truncated = false;
    
    do {
      const listed = await env.R2.list({ 
        prefix: 'notes/',
        limit: 1000,
        cursor
      });
      
      files.push(...listed.objects.map(obj => obj.key.replace('notes/', '')));
      
      truncated = listed.truncated;
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (truncated);
    
    return new Response(JSON.stringify({
      success: true,
      files,
      count: files.length
    }), {
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