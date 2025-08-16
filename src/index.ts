import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { Env } from './types';
import ObsidianVectorizeMCPHandler, { ObsidianVectorizeMCP } from './mcp/server';
import ChatGPTMCPHandler, { ChatGPTMCP } from './mcp/server-chatgpt';
import { handleApiRequest } from './api/router';
import app from './auth/app';

// Export both Durable Object classes
export { ObsidianVectorizeMCP, ChatGPTMCP };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle API routes separately
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env);
    }
    
    // Create OAuth provider with support for both standard and ChatGPT endpoints
    const oauthProvider = new OAuthProvider({
      apiHandlers: {
        // Standard MCP endpoints (full Obsidian tools)
        '/sse': ObsidianVectorizeMCP.serveSSE('/sse', { binding: 'MCP_OBJECT' }),
        '/sse/': ObsidianVectorizeMCP.serveSSE('/sse', { binding: 'MCP_OBJECT' }),
        '/mcp': ObsidianVectorizeMCP.serve('/mcp', { binding: 'MCP_OBJECT' }),
        '/mcp/': ObsidianVectorizeMCP.serve('/mcp', { binding: 'MCP_OBJECT' }),
        
        // ChatGPT-specific endpoints (search/fetch only)
        '/chatgpt/sse': ChatGPTMCP.serveSSE('/chatgpt/sse', { binding: 'CHATGPT_MCP_OBJECT' }),
        '/chatgpt/sse/': ChatGPTMCP.serveSSE('/chatgpt/sse', { binding: 'CHATGPT_MCP_OBJECT' }),
        '/chatgpt/mcp': ChatGPTMCP.serve('/chatgpt/mcp', { binding: 'CHATGPT_MCP_OBJECT' }),
        '/chatgpt/mcp/': ChatGPTMCP.serve('/chatgpt/mcp', { binding: 'CHATGPT_MCP_OBJECT' }),
      },
      defaultHandler: app as any,
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/token",
      clientRegistrationEndpoint: "/register",
    });
    
    return oauthProvider.fetch(request, env, ctx);
  }
};