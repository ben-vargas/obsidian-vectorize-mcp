import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Env, State } from '../types';
import { generateEmbedding } from '../utils/embeddings';

function registerChatGPTTools(agent: ChatGPTMCP, env: Env) {
  const vectorize = env.VECTORIZE;
  
  // Tool 1: Search (ChatGPT-required)
  agent.server.tool(
    "search",
    "Search for documents in Obsidian vault",
    {
      query: z.string().describe("Search query string")
    },
    async ({ query }) => {
      try {
        // Generate embedding
        const queryEmbedding = await generateEmbedding(query, env);
        
        // Search vectorize
        const results = await vectorize.query(queryEmbedding, {
          topK: 10,
          returnMetadata: true
        });
        
        // Transform to ChatGPT format
        const searchResults = results.matches
          .filter(match => match.score >= 0.5)
          .map(match => {
            const metadata = match.metadata as any;
            const vaultName = env.OBSIDIAN_VAULT_NAME || 'ObsidianVault';
            
            return {
              id: metadata.path,
              title: metadata.title || metadata.path.split('/').pop()?.replace('.md', '') || 'Untitled',
              text: metadata.content ? 
                metadata.content.substring(0, 200) + (metadata.content.length > 200 ? '...' : '') : 
                'No preview available',
              url: `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(metadata.path)}`
            };
          });
        
        // Return as JSON string in MCP content wrapper
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ results: searchResults }, null, 2)
          }]
        };
      } catch (error: any) {
        console.error('ChatGPT search error:', error);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ 
              results: [], 
              error: `Search failed: ${error.message}` 
            }, null, 2)
          }]
        };
      }
    }
  );
  
  // Tool 2: Fetch (ChatGPT-required)
  agent.server.tool(
    "fetch",
    "Retrieve complete document content by ID",
    {
      id: z.string().describe("Document ID (note path)")
    },
    async ({ id }) => {
      try {
        // Fetch from R2
        const r2Key = `notes/${id}`;
        const r2Object = await env.R2.get(r2Key);
        
        if (!r2Object) {
          throw new Error(`Document not found: ${id}`);
        }
        
        const noteData = await r2Object.json() as any;
        const vaultName = env.OBSIDIAN_VAULT_NAME || 'ObsidianVault';
        
        // Return as JSON string in MCP content wrapper
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              id: id,
              title: noteData.title || id.split('/').pop()?.replace('.md', '') || 'Untitled',
              text: noteData.content || '',
              url: `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(id)}`,
              metadata: {
                tags: noteData.tags || [],
                createdAt: noteData.createdAt,
                modifiedAt: noteData.modifiedAt,
                path: id
              }
            }, null, 2)
          }]
        };
      } catch (error: any) {
        console.error('ChatGPT fetch error:', error);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              id: id,
              title: 'Error',
              text: `Failed to retrieve document: ${error.message}`,
              url: '',
              metadata: null
            }, null, 2)
          }]
        };
      }
    }
  );
}

export class ChatGPTMCP extends McpAgent<Env, State, {}> {
  server = new McpServer({ 
    name: "obvec-chatgpt",
    version: "0.1.0",
    title: "Obsidian Notes for ChatGPT"
  }, {
    instructions: `This MCP server provides ChatGPT-compatible search and fetch tools for Obsidian notes.
    
It implements the exact specification required by ChatGPT connectors:
- search: Accepts a query string, returns search results as JSON
- fetch: Accepts a document ID (note path), returns full content as JSON

Responses are formatted as JSON strings for ChatGPT compatibility.
The server accesses your indexed Obsidian vault through Cloudflare Vectorize for semantic search.`
  });

  override initialState: State = { 
    searchCount: 0 
  };

  constructor(
    public override ctx: DurableObjectState,
    public override env: Env
  ) {
    super(ctx, env);
  }

  async init() {
    registerChatGPTTools(this, this.env);
  }

  override onStateUpdate(state: State) {
    console.log('ChatGPT MCP Agent state updated:', state);
  }
}

// Create the API handler for ChatGPT endpoints
export default {
  fetch: (req: Request, env: unknown, ctx: ExecutionContext) => {
    const url = new URL(req.url);
    
    // ChatGPT SSE endpoints (deprecated but supported)
    if (url.pathname === '/chatgpt/sse' || url.pathname === '/chatgpt/sse/message') {
      return ChatGPTMCP.serveSSE('/chatgpt/sse').fetch(req, env, ctx);
    }
    
    // ChatGPT Streamable HTTP endpoint (recommended)
    if (url.pathname === '/chatgpt/mcp') {
      return ChatGPTMCP.serve('/chatgpt/mcp').fetch(req, env, ctx);
    }
    
    return new Response('Not found', { status: 404 });
  },
};