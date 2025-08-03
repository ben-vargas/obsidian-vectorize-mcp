import { Env } from '../types';
import { constantTimeCompare } from './security';

export async function checkRateLimit(ip: string, action: string, env: Env): Promise<boolean> {
  const key = `rate_limit:${action}:${ip}`;
  const limit = action === 'auth_attempt' ? 5 : 10; // 5 attempts for auth, 10 for other actions
  const window = 60 * 15; // 15 minute window
  
  const current = await env.OAUTH_KV.get(key);
  const attempts = current ? parseInt(current) : 0;
  
  if (attempts >= limit) {
    return false; // Rate limit exceeded
  }
  
  await env.OAUTH_KV.put(key, (attempts + 1).toString(), {
    expirationTtl: window
  });
  
  return true;
}

export function checkAuthHeader(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.substring(7);
  
  // Use constant-time comparison to prevent timing attacks
  if (!env.MCP_PASSWORD) {
    return false;
  }
  
  return constantTimeCompare(token, env.MCP_PASSWORD);
}

/**
 * Combines authentication and rate limiting checks for API endpoints
 * @param request - The incoming request
 * @param env - Environment bindings
 * @returns Promise<boolean> - true if both auth and rate limit pass
 */
export async function checkAuthAndRateLimit(request: Request, env: Env): Promise<boolean> {
  // First check authentication
  if (!checkAuthHeader(request, env)) {
    return false;
  }
  
  // Then check rate limiting
  const clientIp = request.headers.get('CF-Connecting-IP') || 
                   request.headers.get('X-Forwarded-For') || 
                   'unknown';
  
  const allowed = await checkRateLimit(clientIp, 'api_request', env);
  return allowed;
}