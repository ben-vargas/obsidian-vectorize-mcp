# MCP Debugging Guide

This document covers critical debugging information and common issues when working with the MCP server implementation.

## 🚨 Critical Requirements

### Zod Version Requirement

**CRITICAL**: The MCP SDK requires Zod v3.x. Using Zod v4.x will cause runtime errors.

```json
{
  "dependencies": {
    "zod": "^3.25.76"  // NOT "^4.0.14"
  }
}
```

Error you'll see with wrong version:
```
Error: MCP error -32603: keyValidator._parse is not a function
```

### Tool Schema Pattern

**IMPORTANT**: Tool schemas must be plain objects with Zod validators as values. Do NOT wrap in `z.object()`.

✅ **Correct**:
```typescript
agent.server.tool(
  "search_notes",
  "Search through notes",
  {
    query: z.string().describe("The search query"),
    limit: z.number().min(1).max(50).default(10)
  },
  async ({ query, limit }) => { /* ... */ }
);
```

❌ **Incorrect**:
```typescript
agent.server.tool(
  "search_notes",
  "Search through notes",
  z.object({  // DON'T DO THIS!
    query: z.string().describe("The search query"),
    limit: z.number().min(1).max(50).default(10)
  }),
  async ({ query, limit }) => { /* ... */ }
);
```

## 🔧 Common Errors and Solutions

### 1. "3010: invalid input"
- **Cause**: AI binding not available in Durable Object context
- **Solution**: Ensure bindings are passed correctly through environment

### 2. "keyValidator._parse is not a function"
- **Cause**: Wrong Zod version or incorrect schema format
- **Solution**: Use Zod v3.x and plain object schemas (see above)

### 3. "Cannot read properties of undefined"
- **Cause**: Tool parameters not being parsed correctly
- **Solution**: Check schema format and ensure no `z.object()` wrapper

### 4. "VECTOR_QUERY_ERROR (code = 40025)"
- **Cause**: Requesting more than 50 results with `returnMetadata=true`
- **Solution**: Cap `topK` at 50 when using `returnMetadata=true`

### 5. OAuth flow not working
- **Cause**: MCP client connection issues or password not set
- **Solution**: Verify `MCP_PASSWORD` is set via `wrangler secret put MCP_PASSWORD`

## 🛠️ Testing and Debugging

### Enable Logging
```bash
wrangler tail --format=pretty
```

### Test MCP Connection
```bash
npx @modelcontextprotocol/inspector
# Enter your worker URL with /mcp or /sse endpoint
```

### Test Endpoints
```bash
# Test health
curl https://your-worker.workers.dev/api/health

# Test stats (requires authentication)
curl -H "Authorization: Bearer your-password" \
  https://your-worker.workers.dev/api/stats
```

## 🌐 Transport Methods

### Streamable HTTP (Recommended)
- **Endpoint**: `/mcp`
- **Status**: Current MCP specification (v2025-03-26)
- **Supported by**: claude.ai, Claude Code
- **Benefits**: Single endpoint, better scaling

### Server-Sent Events (Legacy)
- **Endpoint**: `/sse`
- **Status**: Deprecated (March 26, 2025)
- **Supported by**: Claude Desktop, Cursor, Windsurf
- **Note**: Maintained for backward compatibility

## 💡 Data Handling Tips

### Always Handle Missing Data
```typescript
// Tags might not always be an array
Tags: ${Array.isArray(metadata.tags) ? metadata.tags.join(', ') : 'None'}

// Content might be missing
Preview: ${metadata.content?.substring(0, 200) || 'No preview available'}
```

### Vectorize Limits
- Maximum 50 results when using `returnMetadata=true`
- This affects `search_notes` and `analyze_connections`
- Use `list_notes` for larger result sets (uses R2, no limit)

## 🔍 Quick Diagnostics

If your MCP server isn't working:

1. **Check Zod version**: `npm list zod` (should be v3.x)
2. **Verify password**: `wrangler secret list` (should show MCP_PASSWORD)
3. **Test endpoints**: Use curl to test `/api/health`
4. **Check logs**: `wrangler tail` to see real-time errors
5. **Try MCP Inspector**: Test connection with official MCP tools

This debugging information was hard-won through actual implementation challenges. Keep this guide handy when troubleshooting MCP issues!