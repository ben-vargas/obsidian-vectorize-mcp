import { Env, StatsResponse } from '../types';
import { checkAuthAndRateLimit } from '../utils/auth';

export async function handleStats(request: Request, env: Env): Promise<Response> {
  // Check authorization and rate limit
  if (!(await checkAuthAndRateLimit(request, env))) {
    return new Response('Unauthorized or rate limit exceeded', { status: 401 });
  }
  
  try {
    // Get actual R2 stats (exact counts)
    let r2TotalCount = 0;
    let r2TotalSize = 0;
    let r2Truncated = false;
    let r2SampleFiles: any[] = [];
    let cursor: string | undefined;
    
    // Paginate through all R2 objects to get exact count
    do {
      const r2Listed = await env.R2.list({ 
        prefix: 'notes/', 
        limit: 1000,
        cursor 
      });
      
      r2TotalCount += r2Listed.objects.length;
      for (const obj of r2Listed.objects) {
        r2TotalSize += obj.size;
      }
      
      // Keep first 5 files as samples
      if (r2SampleFiles.length < 5) {
        r2SampleFiles.push(...r2Listed.objects.slice(0, 5 - r2SampleFiles.length).map(obj => ({
          key: obj.key,
          size: `${(obj.size / 1024).toFixed(2)} KB`
        })));
      }
      
      r2Truncated = r2Listed.truncated;
      cursor = r2Listed.truncated ? r2Listed.cursor : undefined;
    } while (r2Truncated);
    
    // For Vectorize, we assume count matches R2 since Cloudflare doesn't provide a direct count API
    // In a properly synchronized system, these should match
    // Note: This is an assumption - actual vector count may differ if sync issues occur
    const vectorCount = r2TotalCount;
    
    const response: StatsResponse = {
      vectorize: {
        index: 'obsidian-notes',
        count: vectorCount,
        dimensions: 1024
      },
      r2: {
        bucket: 'obsidian-metadata',
        objectCount: r2TotalCount,
        totalSize: `${(r2TotalSize / 1024 / 1024).toFixed(2)} MB`,
        totalSizeBytes: r2TotalSize,
        sampleFiles: r2SampleFiles
      }
    };
    
    return new Response(JSON.stringify(response, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}