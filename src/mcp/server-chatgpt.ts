import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Env, State } from '../types';
import { generateEmbedding } from '../utils/embeddings';

function registerChatGPTTools(agent: ChatGPTMCP, env: Env) {
  const vectorize = env.VECTORIZE;
  
  // Tool 1: Search (ChatGPT-required)
  // ChatGPT expects the search tool to accept a single "query" string parameter
  // and return an object with a "results" array containing objects with id, title, text, url
  agent.server.tool(
    "search",
    "Search for documents in Obsidian vault",
    {
      query: z.string().describe("Search query string")
    },
    async ({ query }) => {
      console.log(`ChatGPT search requested for query: "${query}"`);
      
      // Parse QDF (Query Deserves Freshness) parameter if present
      const qdfMatch = query.match(/--QDF=(\d)/);
      const qdf = qdfMatch ? parseInt(qdfMatch[1], 10) : null;
      const cleanQuery = query.replace(/--QDF=\d/, '').trim();
      
      if (qdf !== null) {
        console.log(`Query includes QDF=${qdf} (freshness hint)`);
      }
      
      // Check if QDF support is enabled
      const useQDF = env.CHATGPT_USE_QDF === 'true';
      
      try {
        // Generate embedding using cleaned query
        const queryEmbedding = await generateEmbedding(cleanQuery, env);
        console.log(`Generated embedding for query, dimensions: ${queryEmbedding.length}`);
        
        // Search vectorize
        const results = await vectorize.query(queryEmbedding, {
          topK: 10,
          returnMetadata: true
        });
        console.log(`Vectorize returned ${results.matches.length} matches`);
        
        // Get minimum score threshold from environment or use default
        const minScore = env.CHATGPT_MIN_SCORE ? parseFloat(env.CHATGPT_MIN_SCORE) : 0.3;
        console.log(`Using minimum score threshold: ${minScore}`);
        
        // Log all scores for debugging
        console.log('All match scores:', results.matches.map(m => ({
          path: (m.metadata as any).path,
          score: m.score
        })));
        
        // Apply QDF time-based scoring if enabled and QDF is present
        let processedResults = results.matches;
        
        if (useQDF && qdf !== null && qdf >= 3) {
          // Only apply freshness boost for QDF 3+ (moderately fresh to very fresh)
          // QDF scale: 3 = 90 days, 4 = 60 days, 5 = 30 days
          const daysCutoff = qdf === 5 ? 30 : qdf === 4 ? 60 : 90;
          const cutoffDate = new Date(Date.now() - daysCutoff * 24 * 60 * 60 * 1000);
          
          console.log(`Applying QDF=${qdf} freshness boost for notes modified in last ${daysCutoff} days`);
          
          processedResults = processedResults.map(match => {
            const metadata = match.metadata as any;
            if (metadata.modifiedAt) {
              const modifiedDate = new Date(metadata.modifiedAt);
              if (modifiedDate > cutoffDate) {
                // Boost recent notes by 10-20% based on QDF level
                const boostFactor = 1 + (0.05 * (qdf - 2)); // QDF=3: 1.05, QDF=4: 1.10, QDF=5: 1.15
                return { ...match, score: Math.min(1.0, match.score * boostFactor) };
              }
            }
            return match;
          }).sort((a, b) => b.score - a.score);
        }
        
        // Transform to ChatGPT format - each result must have: id, title, text, url
        const searchResults = processedResults
          .filter(match => match.score >= minScore)
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
        
        // ChatGPT expects a plain JSON object with a "results" array
        const response = { results: searchResults };
        
        // Return as text content with JSON string for MCP protocol compatibility
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(response, null, 2)
          }]
        };
      } catch (error: any) {
        console.error('ChatGPT search error:', error);
        
        const errorResponse = { 
          results: [], 
          error: `Search failed: ${error.message}` 
        };
        
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(errorResponse, null, 2)
          }]
        };
      }
    }
  );
  
  // Tool 2: Fetch (ChatGPT-required)
  // ChatGPT expects the fetch tool to accept a single "id" string parameter
  // and return a single object with id, title, text, url, and optional metadata
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
        
        // ChatGPT expects a single document object with id, title, text, url, and optional metadata
        const response = {
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
        };
        
        // Return as text content with JSON string for MCP protocol compatibility
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(response, null, 2)
          }]
        };
      } catch (error: any) {
        console.error('ChatGPT fetch error:', error);
        
        const errorResponse = {
          id: id,
          title: 'Error',
          text: `Failed to retrieve document: ${error.message}`,
          url: '',
          metadata: null
        };
        
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(errorResponse, null, 2)
          }]
        };
      }
    }
  );
}

export class ChatGPTMCP extends McpAgent<Env, State, {}> {
  private mcpServer: McpServer;
  
  override initialState: State = { 
    searchCount: 0 
  };

  constructor(
    public override ctx: DurableObjectState,
    public override env: Env
  ) {
    super(ctx, env);
    
    // Initialize the MCP server
    this.mcpServer = new McpServer({ 
      name: "obvec-chatgpt",
      version: "0.1.0",
      title: "Obsidian Notes for ChatGPT"
    }, {
      instructions: `This MCP server provides ChatGPT-compatible search and fetch tools for Obsidian notes.

It implements the exact OpenAI specification required by ChatGPT connectors:

SEARCH TOOL:
- Accepts: single "query" string parameter
- Returns: object with "results" array containing {id, title, text, url} objects
- Purpose: Find relevant documents matching the search query

FETCH TOOL:
- Accepts: single "id" string parameter (document path)
- Returns: single object with {id, title, text, url, metadata} structure
- Purpose: Retrieve complete content of a specific document

The server uses Cloudflare Vectorize for semantic search across your indexed Obsidian vault.
All responses follow the exact JSON format expected by ChatGPT connectors.`
    });
  }
  
  // Implement the abstract server property
  get server(): McpServer {
    return this.mcpServer;
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