import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { Env } from './types';
import ObsidianVectorizeMCPHandler, { ObsidianVectorizeMCP } from './mcp/server';
import { handleApiRequest } from './api/router';
import app from './auth/app';

// Export the Durable Object class
export { ObsidianVectorizeMCP };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle API routes separately
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env);
    }
    
    // Create OAuth provider with support for both SSE and Streamable HTTP
    const oauthProvider = new OAuthProvider({
      apiHandlers: {
        '/sse': ObsidianVectorizeMCP.serveSSE('/sse'),
        '/mcp': ObsidianVectorizeMCP.serve('/mcp'),
      },
      defaultHandler: app as any,
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/token",
      clientRegistrationEndpoint: "/register",
    });
    
    return oauthProvider.fetch(request, env, ctx);
  }
};