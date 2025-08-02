import { Env } from '../types';
import { checkAuthHeader } from '../utils/auth';
import { hashPath } from '../utils/hash';

export async function handleCleanup(request: Request, env: Env): Promise<Response> {
  // Check authorization
  if (!checkAuthHeader(request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  try {
    const { files } = await request.json() as { files: string[] };
    
    if (!files || !Array.isArray(files)) {
      return new Response('Invalid request: files array required', { status: 400 });
    }
    
    let deletedCount = 0;
    
    // Delete from both R2 and Vectorize
    for (const file of files) {
      // Delete from R2
      await env.R2.delete(`notes/${file}`);
      
      // Delete from Vectorize (using the same hash ID generation)
      const shortId = await hashPath(file);
      await env.VECTORIZE.deleteByIds([shortId]);
      deletedCount++;
    }
    
    return new Response(JSON.stringify({
      success: true,
      deletedCount,
      message: `Successfully deleted ${deletedCount} orphaned files`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('Cleanup error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}