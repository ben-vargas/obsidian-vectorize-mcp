import type {
  Ai,
  VectorizeIndex,
  KVNamespace,
  R2Bucket,
  DurableObjectNamespace
} from '@cloudflare/workers-types';

export interface Env {
  AI: Ai;
  VECTORIZE: VectorizeIndex;
  KV: KVNamespace;
  R2: R2Bucket;
  OAUTH_KV: KVNamespace; // Required for OAuth Provider Library
  MCP_OBJECT: DurableObjectNamespace; // MCP Durable Object
  CHATGPT_MCP_OBJECT: DurableObjectNamespace; // ChatGPT-specific MCP Durable Object
  EMBEDDING_MODEL?: string;
  EMBEDDING_DIMENSIONS?: string;
  // Simple Authentication (for mock auth flow)
  MCP_PASSWORD?: string; // Set via wrangler secret put MCP_PASSWORD
  // Obsidian configuration
  OBSIDIAN_VAULT_NAME?: string; // Name of the Obsidian vault for URL generation
}

export type State = { 
  lastSearchQuery?: string;
  searchCount: number;
  totalNotesIndexed?: number;
};

export interface Note {
  path: string;
  title: string;
  content: string;
  tags: string[];
  frontmatter?: Record<string, any>;
  createdAt?: string;  // ISO 8601 timestamp
  modifiedAt?: string; // ISO 8601 timestamp
}

export interface SearchResult {
  score: number;
  title: string;
  path: string;
  tags: string[];
  preview?: string;
  content?: string;
  createdAt?: string;
  modifiedAt?: string;
}

export interface StatsResponse {
  vectorize: {
    index: string;
    count: number;
    dimensions: number;
  };
  r2: {
    bucket: string;
    objectCount: number;
    totalSize: string;
    totalSizeBytes: number;
    sampleFiles: Array<{ key: string; size: string }>;
  };
}