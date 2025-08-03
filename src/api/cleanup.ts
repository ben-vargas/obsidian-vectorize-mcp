import { Env } from '../types';
import { checkAuthAndRateLimit } from '../utils/auth';
import { hashPath } from '../utils/hash';
import { sanitizePath } from '../utils/security';

export async function handleCleanup(request: Request, env: Env): Promise<Response> {
  // Check authorization and rate limit
  if (!(await checkAuthAndRateLimit(request, env))) {
    return new Response('Unauthorized or rate limit exceeded', { status: 401 });
  }
  
  try {
    const { files } = await request.json() as { files: string[] };
    
    if (!files || !Array.isArray(files)) {
      return new Response('Invalid request: files array required', { status: 400 });
    }
    
    let deletedCount = 0;
    
    // Delete from both R2 and Vectorize
    for (const file of files) {
      // Validate and sanitize the path
      let validatedPath;
      try {
        validatedPath = sanitizePath(file);
      } catch (error) {
        console.error(`Invalid path, skipping: ${file}`);
        continue;
      }
      
      // Delete from R2
      await env.R2.delete(`notes/${validatedPath}`);
      
      // Delete from Vectorize (using the same hash ID generation)
      const shortId = await hashPath(validatedPath);
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