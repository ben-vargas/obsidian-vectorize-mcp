# Troubleshooting

## Common Issues

**1. "OAUTH_KV binding not found"**
```bash
wrangler kv:namespace create oauth_tokens
# Update wrangler.toml with returned namespace ID
```

**2. "MCP_PASSWORD not configured"**
```bash
wrangler secret put MCP_PASSWORD
```

**3. "OAuth flow not working"**
```bash
# Test authorization endpoint
curl "https://your-worker.workers.dev/authorize?client_id=test&redirect_uri=http%3A//localhost&state=123"
```

**4. MCP client connection issues**
```bash
# Test with MCP Inspector
npx @modelcontextprotocol/inspector
# For SSE: https://your-worker.workers.dev/sse
# For Streamable HTTP: https://your-worker.workers.dev/mcp
```

## Advanced Debugging

### Check Worker Logs
```bash
wrangler tail
```

### Test Local Development
```bash
# Start local worker
obvec dev

# In another terminal, test endpoints
curl http://localhost:8787/api/health
```

### System Diagnostics
Test if all components are working correctly:
```bash
# Test deployment health (requires your MCP password)
curl -H "Authorization: Bearer your-password" \
  https://your-worker.workers.dev/api/test-mcp
```

**Expected output when everything is working:**
```json
{
  "bindings": {
    "AI": true,
    "VECTORIZE": true,
    "MCP_OBJECT": true,
    "EMBEDDING_MODEL": "@cf/baai/bge-large-en-v1.5",
    "EMBEDDING_DIMENSIONS": "1024"
  },
  "embeddingTest": {
    "success": true,
    "error": "",
    "length": 1024
  },
  "vectorizeTest": {
    "success": true,
    "error": "",
    "count": 0
  },
  "timestamp": "2025-08-02T21:04:24.820Z"
}
```

**If any test fails, you'll see specific error messages to help diagnose the issue.**

### Verify Cloudflare Resources
```bash
# Check KV namespaces
wrangler kv:namespace list

# Check R2 buckets
wrangler r2 bucket list

# Check secrets
wrangler secret list
```

### MCP Connection Testing
```bash
# Test MCP endpoint directly
curl -X POST https://your-worker.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-password" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Getting Help

- **Cloudflare Docs**: https://developers.cloudflare.com/
- **Workers AI Models**: https://developers.cloudflare.com/workers-ai/models/
- **MCP Specification**: https://modelcontextprotocol.io/
- **GitHub Issues**: [Report issues](https://github.com/ben-vargas/obsidian-vectorize-mcp/issues)