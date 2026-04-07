import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Env, State } from '../types';
import { generateEmbedding, getEmbeddingDimensions } from '../utils/embeddings';
import { getNoteListIndex } from '../utils/note-list-index';
import { validateLimit, validateMinScore } from '../utils/validation';

function registerObsidianTools(agent: ObsidianVectorizeMCP, env: Env) {
  const ai = env.AI;
  const vectorize = env.VECTORIZE;
  const embeddingModel = env.EMBEDDING_MODEL || '@cf/baai/bge-large-en-v1.5';
  const embeddingDimensions = getEmbeddingDimensions(env);
    
  // Tool 1: Search through Obsidian notes
  agent.server.tool(
      "search_notes",
      "Search through Obsidian notes using semantic similarity",
      {
        query: z.string().describe("The search query"),
        limit: z.number().min(1).max(50).default(10).describe("Maximum number of results to return"),
        minScore: z.number().min(0).max(1).default(0.7).describe("Minimum similarity score (0.0-1.0)"),
        tags: z.array(z.string()).optional().describe("Filter by specific tags"),
        sortBy: z.enum(['relevance', 'createdAt', 'modifiedAt']).default('relevance').describe("Sort results by relevance, creation date, or modification date")
      },
      async ({ query, limit: rawLimit, minScore: rawMinScore, tags, sortBy }) => {
        // Validate parameters (outside try to be accessible in catch)
        const limit = validateLimit(rawLimit, 10, 50);
        const minScore = validateMinScore(rawMinScore, 0.7);
        
        try {
          
          // Update state
          agent.setState({ 
            ...agent.state, 
            lastSearchQuery: query,
            searchCount: agent.state.searchCount + 1 
          });

          // Generate embedding
          const queryEmbedding = await generateEmbedding(query, env);

          // Search vectorize
          const results = await vectorize.query(queryEmbedding, {
            topK: limit,
            returnMetadata: true
          });

          // Filter results
          const filteredResults = results.matches
            .filter(match => match.score >= minScore)
            .filter(match => {
              if (!tags || tags.length === 0) return true;
              const noteTags = (match.metadata as any).tags || [];
              return tags.some((tag: string) => noteTags.includes(tag));
            });

          if (filteredResults.length === 0) {
            return {
              content: [{
                type: "text" as const,
                text: `No notes found matching "${query}" with minimum score ${minScore}.`
              }]
            };
          }

          // Sort results based on sortBy parameter
          let sortedResults = filteredResults;
          if (sortBy === 'createdAt') {
            sortedResults = filteredResults.sort((a, b) => {
              const aDate = (a.metadata as any).createdAt || '';
              const bDate = (b.metadata as any).createdAt || '';
              return bDate.localeCompare(aDate); // Newest first
            });
          } else if (sortBy === 'modifiedAt') {
            sortedResults = filteredResults.sort((a, b) => {
              const aDate = (a.metadata as any).modifiedAt || '';
              const bDate = (b.metadata as any).modifiedAt || '';
              return bDate.localeCompare(aDate); // Newest first
            });
          }
          // Default is 'relevance' which is already sorted by score

          const resultsText = sortedResults.map((match, index) => {
            const metadata = match.metadata as any;
            const createdDate = metadata.createdAt ? new Date(metadata.createdAt).toLocaleDateString() : 'Unknown';
            const modifiedDate = metadata.modifiedAt ? new Date(metadata.modifiedAt).toLocaleDateString() : 'Unknown';
            
            return `${index + 1}. **${metadata.title}** (Score: ${match.score.toFixed(3)})
   Path: ${metadata.path}
   Tags: ${Array.isArray(metadata.tags) ? metadata.tags.join(', ') : 'None'}
   Created: ${createdDate} | Modified: ${modifiedDate}
   Preview: ${metadata.content?.substring(0, 200)}...
`;
          }).join('\n');

          return {
            content: [{
              type: "text" as const,
              text: `Found ${filteredResults.length} notes matching "${query}":\n\n${resultsText}`
            }]
          };

        } catch (error: any) {
          console.error('MCP search error:', error);
          console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            query,
            limit: limit,
            minScore: minScore,
            tags
          });
          
          return {
            content: [{
              type: "text" as const,
              text: `Error searching notes: ${error.message}${error.code ? ` (code: ${error.code})` : ''}`
            }]
          };
        }
      }
    );

  // Tool 2: Get a specific note
  agent.server.tool(
      "get_note",
      "Retrieve a specific note by its path or search for it",
      {
        path: z.string().optional().describe("The file path of the note"),
        searchTerm: z.string().optional().describe("Search term to find the note if path is unknown")
      },
      async ({ path, searchTerm }) => {
        try {
          
          if (!path && !searchTerm) {
            return {
              content: [{
                type: "text" as const,
                text: 'Error: Either path or searchTerm must be provided.'
              }]
            };
          }

          let notePath: string | null = null;
          let metadata: any = null;

          if (path) {
            // Direct path provided - use it
            notePath = path;
          } else if (searchTerm) {
            // Search for the note and get the best match
            const queryEmbedding = await generateEmbedding(searchTerm, env);
            const results = await vectorize.query(queryEmbedding, {
              topK: 1,
              returnMetadata: true
            });

            if (results.matches.length > 0) {
              metadata = results.matches[0].metadata as any;
              notePath = metadata.path;
            }
          }

          if (!notePath) {
            return {
              content: [{
                type: "text" as const,
                text: searchTerm 
                  ? `No notes found matching "${searchTerm}".`
                  : `Note not found.`
              }]
            };
          }

          // Fetch the full content from R2
          const r2Key = `notes/${notePath}`;
          const r2Object = await env.R2.get(r2Key);
          
          if (!r2Object) {
            return {
              content: [{
                type: "text" as const,
                text: `Note with path "${notePath}" not found in storage.`
              }]
            };
          }

          // The R2 object contains the full note as JSON
          const noteData = await r2Object.json() as any;
          const fullContent = noteData.content || '';
          
          // Use metadata from the note object or from what we already have
          if (!metadata) {
            metadata = {
              title: noteData.title || notePath.split('/').pop()?.replace('.md', '') || 'Untitled',
              tags: noteData.tags || [],
              createdAt: noteData.createdAt,
              modifiedAt: noteData.modifiedAt
            };
          }

          const createdDate = noteData.createdAt ? new Date(noteData.createdAt).toLocaleString() : 'Unknown';
          const modifiedDate = noteData.modifiedAt ? new Date(noteData.modifiedAt).toLocaleString() : 'Unknown';

          return {
            content: [{
              type: "text" as const,
              text: `# ${metadata.title}

**Path:** ${notePath}
**Tags:** ${Array.isArray(metadata.tags) ? metadata.tags.join(', ') : 'None'}
**Created:** ${createdDate}
**Modified:** ${modifiedDate}

## Content:
${fullContent}`
            }]
          };

        } catch (error: any) {
          return {
            content: [{
              type: "text" as const,
              text: `Error retrieving note: ${error.message}`
            }]
          };
        }
      }
    );

  // Tool 3: List notes with filters
  agent.server.tool(
      "list_notes",
      "List notes with optional filtering",
      {
        limit: z.number().min(1).max(100).default(20).describe("Maximum number of notes to return"),
        tags: z.array(z.string()).optional().describe("Filter by specific tags"),
        pathPrefix: z.string().optional().describe("Filter by path prefix (folder)"),
        sortBy: z.enum(['title', 'createdAt', 'modifiedAt']).default('title').describe("Sort results by title, creation date, or modification date"),
        dateFrom: z.string().optional().describe("Filter notes created or modified after this ISO date"),
        dateTo: z.string().optional().describe("Filter notes created or modified before this ISO date")
      },
      async ({ limit, tags, pathPrefix, sortBy, dateFrom, dateTo }) => {
        try {
          const noteListIndex = await getNoteListIndex(env);
          let notes = Object.values(noteListIndex.notes);

          if (pathPrefix) {
            notes = notes.filter(note => note.path.startsWith(pathPrefix));
          }

          if (tags && tags.length > 0) {
            notes = notes.filter(note => {
              const noteTags = note.tags || [];
              return tags.some(tag => noteTags.includes(tag));
            });
          }

          if (dateFrom || dateTo) {
            const fromDate = dateFrom ? new Date(dateFrom) : null;
            const toDate = dateTo ? new Date(dateTo) : null;

            notes = notes.filter(note => {
              const noteDates = [note.createdAt, note.modifiedAt]
                .filter((value): value is string => Boolean(value))
                .map(value => new Date(value))
                .filter(date => !Number.isNaN(date.getTime()));

              if (noteDates.length === 0) {
                return true;
              }

              return noteDates.some(noteDate => {
                if (fromDate && noteDate < fromDate) {
                  return false;
                }
                if (toDate && noteDate > toDate) {
                  return false;
                }
                return true;
              });
            });
          }

          if (notes.length === 0) {
            return {
              content: [{
                type: "text" as const,
                text: 'No notes found matching the specified criteria.'
              }]
            };
          }

          // Sort notes based on sortBy parameter
          notes.sort((a, b) => {
            if (sortBy === 'title') {
              return a.title.localeCompare(b.title);
            } else if (sortBy === 'createdAt') {
              return (b.createdAt || '').localeCompare(a.createdAt || ''); // Newest first
            } else if (sortBy === 'modifiedAt') {
              return (b.modifiedAt || '').localeCompare(a.modifiedAt || ''); // Newest first
            }
            return 0;
          });

          // Apply limit after sorting (important for date-sorted queries that collected all notes)
          notes = notes.slice(0, limit);

          const notesList = notes.map((note, index) => {
            const createdDate = note.createdAt ? new Date(note.createdAt).toLocaleDateString() : 'Unknown';
            const modifiedDate = note.modifiedAt ? new Date(note.modifiedAt).toLocaleDateString() : 'Unknown';
            
            return `${index + 1}. **${note.title}**
   Path: ${note.path}
   Tags: ${Array.isArray(note.tags) ? note.tags.join(', ') : 'None'}
   Created: ${createdDate} | Modified: ${modifiedDate}`;
          }).join('\n\n');

          return {
            content: [{
              type: "text" as const,
              text: `Found ${notes.length} notes:\n\n${notesList}`
            }]
          };

        } catch (error: any) {
          return {
            content: [{
              type: "text" as const,
              text: `Error listing notes: ${error.message}`
            }]
          };
        }
      }
    );

  // Tool 4: Analyze connections between notes
  agent.server.tool(
      "analyze_connections",
      "Find notes related to a specific note or topic",
      {
        reference: z.string().describe("Note path, title, or topic to analyze connections for"),
        limit: z.number().min(1).max(20).default(10).describe("Maximum number of connections to return"),
        minScore: z.number().min(0).max(1).default(0.6).describe("Minimum similarity score for connections")
      },
      async ({ reference, limit: rawLimit, minScore: rawMinScore }) => {
        try {
          // Validate parameters
          const limit = validateLimit(rawLimit, 10, 20);
          const minScore = validateMinScore(rawMinScore, 0.6);
          
          // Generate embedding for the reference
          const referenceEmbedding = await generateEmbedding(reference, env);

          // Find similar notes
          const results = await vectorize.query(referenceEmbedding, {
            topK: limit + 1, // +1 in case the reference itself is in results
            returnMetadata: true
          });

          const connections = results.matches
            .filter(match => match.score >= minScore)
            .filter(match => {
              // Exclude exact matches with the reference
              const metadata = match.metadata as any;
              return metadata.title !== reference && metadata.path !== reference;
            })
            .slice(0, limit);

          if (connections.length === 0) {
            return {
              content: [{
                type: "text" as const,
                text: `No related notes found for "${reference}" with minimum score ${minScore}.`
              }]
            };
          }

          const connectionsText = connections.map((match, index) => {
            const metadata = match.metadata as any;
            return `${index + 1}. **${metadata.title}** (Similarity: ${match.score.toFixed(3)})
   Path: ${metadata.path}
   Tags: ${Array.isArray(metadata.tags) ? metadata.tags.join(', ') : 'None'}
   Connection: ${metadata.content?.substring(0, 150)}...
`;
          }).join('\n');

          return {
            content: [{
              type: "text" as const,
              text: `Found ${connections.length} notes related to "${reference}":\n\n${connectionsText}`
            }]
          };

        } catch (error: any) {
          return {
            content: [{
              type: "text" as const,
              text: `Error analyzing connections: ${error.message}`
            }]
          };
        }
      }
    );
}

export class ObsidianVectorizeMCP extends McpAgent<Env, State, {}> {
  server = new McpServer({ 
    name: "obvec",
    version: "0.1.0",
    title: "Obsidian Notes Assistant"
  }, {
    instructions: `This MCP server provides intelligent access to your Obsidian Notes (markdown files which may represent knowledge bases, meeting notes, code snippets and patterns, todo lists, daily journals, project documentation, research, and more) using semantic search and vector embeddings.

Key capabilities:
- Semantic search: Find notes by meaning, not just keywords
- Time-aware queries: Filter and sort by creation/modification dates
- Full-text retrieval: Access complete note content
- Connection analysis: Discover related notes through AI-powered similarity
- Tag filtering: Organize and filter by Obsidian tags
- Folder navigation: Browse notes by directory structure

Perfect for:
- Finding notes through conceptual search across any type of content
- Discovering connections between ideas, projects, or topics
- Tracking recently modified meeting notes or documentation
- Searching code snippets, patterns, or technical notes
- Accessing todo lists, project plans, or daily journals
- Building a queryable repository of all your markdown-based information

The semantic search understands context and meaning, making it easy to find relevant notes regardless of exact wording.`
  });

  override initialState: State = { 
    searchCount: 0 
  };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async init() {
    registerObsidianTools(this, this.env);
  }

  override onStateUpdate(state: State) {
    console.log('MCP Agent state updated:', state);
  }
}

// Create the API handler like docs-vectorize does
export default {
  fetch: (req: Request, env: unknown, ctx: ExecutionContext) => {
    const url = new URL(req.url);
    
    // SSE transport endpoints
    if (url.pathname === '/sse' || url.pathname === '/sse/message') {
      return ObsidianVectorizeMCP.serveSSE('/sse').fetch(req, env, ctx);
    }
    
    // Streamable HTTP transport endpoints
    if (url.pathname === '/mcp') {
      return ObsidianVectorizeMCP.serve('/mcp').fetch(req, env, ctx);
    }
    
    return new Response('Not found', { status: 404 });
  },
};
