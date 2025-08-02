# Advanced Configuration

## Optimization Features

### Smart Re-indexing
The indexing process includes intelligent optimizations:
- **Checksum-based deduplication**: Only uploads changed files to R2
- **Incremental updates**: Tracks file changes via SHA-256 checksums
- **Efficient storage**: Skips unchanged files on re-indexing
- **Timestamp preservation**: Captures file creation and modification dates

### Cleanup & Maintenance
Remove notes that were deleted from your vault:
```bash
# Check for orphaned notes (deleted from vault but still indexed)
obvec cleanup

# Complete reset if needed
obvec reset
```

## Timestamp Features

All notes now include creation and modification timestamps, enabling powerful time-based queries:

### search_notes
```typescript
// Sort by relevance (default), creation date, or modification date
sortBy: "relevance" | "createdAt" | "modifiedAt"
```

### list_notes
```typescript
// Sort by title (default), creation date, or modification date
sortBy: "title" | "createdAt" | "modifiedAt"

// Filter by date range
dateFrom: "2025-07-01"  // ISO date string
dateTo: "2025-08-01"    // ISO date string
```

Examples:
- Find recently modified notes: `list_notes({ sortBy: "modifiedAt", limit: 10 })`
- Find notes created this week: `list_notes({ dateFrom: "2025-07-29", sortBy: "createdAt" })`
- Search with newest results first: `search_notes({ query: "project", sortBy: "createdAt" })`

## Custom Embedding Models
Edit `wrangler.toml`:
```toml
[vars]
EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5"  # 768 dimensions
EMBEDDING_DIMENSIONS = "768"
```

## OAuth Provider Configuration
The MCP server uses Cloudflare's OAuth Provider Library with a custom Hono app for authentication:
```typescript
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { ObsidianVectorizeMCP } from './mcp/server';
import app from './auth/app';

const oauthProvider = new OAuthProvider({
  apiHandlers: {
    '/sse': ObsidianVectorizeMCP.serveSSE('/sse'),
    '/mcp': ObsidianVectorizeMCP.serve('/mcp'),
  },
  defaultHandler: app,  // Hono app for auth UI
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
```