import { Env } from '../types';
import { handleStats } from './stats';
import { handleSearch } from './search';
import { handleIndex } from './index';
import { handleListIndexed } from './list-indexed';
import { handleCleanup } from './cleanup';
import { handleTestMCP } from './test-mcp';

export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  
  // Route to appropriate handler
  if (url.pathname === '/api/stats' && method === 'GET') {
    return handleStats(request, env);
  }
  
  if (url.pathname === '/api/search' && method === 'POST') {
    return handleSearch(request, env);
  }
  
  if (url.pathname === '/api/index' && method === 'POST') {
    return handleIndex(request, env);
  }
  
  if (url.pathname === '/api/list-indexed' && method === 'GET') {
    return handleListIndexed(request, env);
  }
  
  if (url.pathname === '/api/cleanup' && method === 'POST') {
    return handleCleanup(request, env);
  }
  
  if (url.pathname === '/api/test-mcp' && method === 'GET') {
    return handleTestMCP(request, env);
  }
  
  return new Response('Not found', { status: 404 });
}