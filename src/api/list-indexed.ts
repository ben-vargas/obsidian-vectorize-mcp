import { Env } from '../types';
import { checkAuthHeader } from '../utils/auth';

export async function handleListIndexed(request: Request, env: Env): Promise<Response> {
  // Check authorization
  if (!checkAuthHeader(request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  try {
    // List all objects in R2 notes/ prefix
    const listed = await env.R2.list({ prefix: 'notes/' });
    const files = listed.objects.map(obj => obj.key.replace('notes/', ''));
    
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