# ChatGPT Integration Guide

This guide covers the ChatGPT-specific MCP server implementation, configuration options, and advanced features.

## Overview

The ChatGPT integration provides a dedicated MCP server endpoint optimized for ChatGPT's connector interface. Unlike standard MCP clients, ChatGPT requires specific tool names (`search` and `fetch`) with simplified parameters.

## Quick Setup

1. Add the connector in ChatGPT Settings → Connectors:
   ```
   https://obvec.<account_subdomain>.workers.dev/chatgpt/mcp
   ```

2. Authenticate via OAuth when prompted

3. Select the connector in any chat where Connectors are supported

## Architecture

### Separate Durable Objects

The implementation uses two distinct Durable Objects:
- `ObsidianVectorizeMCP`: Standard MCP server with full Obsidian tools
- `ChatGPTMCP`: Simplified server with only search/fetch tools

This separation ensures:
- No tool confusion between different client types
- Optimal performance for each use case
- Clean API boundaries

### Endpoint Routing

- `/mcp` and `/sse` → Standard MCP server
- `/chatgpt/mcp` and `/chatgpt/sse` → ChatGPT-specific server

## Configuration

All ChatGPT-specific settings are configured via environment variables in `wrangler.toml`:

### CHATGPT_MIN_SCORE

Controls the minimum similarity score for search results.

```toml
CHATGPT_MIN_SCORE = "0.3"  # Default: 0.3, Range: 0.0-1.0
```

- **Lower values (0.2-0.3)**: Return more results, let ChatGPT filter
- **Higher values (0.5-0.7)**: Only high-confidence matches
- **Recommendation**: Keep at 0.3 since ChatGPT excels at filtering

### CHATGPT_USE_QDF

Enables Query Deserves Freshness time-based scoring.

```toml
CHATGPT_USE_QDF = "false"  # Default: false
```

When enabled and ChatGPT sends `--QDF=X` hints:
- **QDF=5**: Boosts notes from last 30 days by 15%
- **QDF=4**: Boosts notes from last 60 days by 10%
- **QDF=3**: Boosts notes from last 90 days by 5%
- **QDF=0-2**: No boost applied

**When to enable:**
- Your vault contains time-sensitive content (meeting notes, daily journals)
- You frequently search for recent information
- You want ChatGPT to prioritize newer content

**When to keep disabled (default):**
- Your vault contains evergreen content (documentation, guides)
- Older notes are often more valuable than recent ones
- You prefer pure semantic similarity without time bias

## Query Deserves Freshness (QDF)

### What is QDF?

QDF is a search ranking concept where certain queries benefit from fresher results. ChatGPT automatically adds `--QDF=X` parameters to queries it considers time-sensitive.

### QDF Scale

| QDF Value | Intent | Time Window | Boost Factor |
|-----------|--------|-------------|--------------|
| 0 | Historical/unchanging | No boost | 1.0x |
| 1 | General information | No boost | 1.0x |
| 2 | Slow-changing | No boost | 1.0x |
| 3 | Moderately fresh | 90 days | 1.05x |
| 4 | Recent/fast-moving | 60 days | 1.10x |
| 5 | Latest/breaking | 30 days | 1.15x |

### Implementation Details

When QDF is detected:
1. The `--QDF=X` parameter is stripped from the query
2. The cleaned query is used for embedding generation
3. If `CHATGPT_USE_QDF="true"` and QDF ≥ 3:
   - Notes modified within the time window get a score boost
   - Results are re-sorted by boosted scores
4. If `CHATGPT_USE_QDF="false"` (default):
   - QDF is logged but ignored
   - No time-based scoring is applied

## Tool Specifications

### search Tool

ChatGPT expects exactly this interface:

```typescript
{
  name: "search",
  description: "Search for documents in Obsidian vault",
  parameters: {
    query: string  // The only parameter ChatGPT can provide
  },
  returns: {
    results: Array<{
      id: string,      // Note path
      title: string,   // Note title
      text: string,    // Preview text (200 chars)
      url: string      // Obsidian URL
    }>
  }
}
```

### fetch Tool

```typescript
{
  name: "fetch",
  description: "Retrieve complete document content by ID",
  parameters: {
    id: string  // Document path
  },
  returns: {
    id: string,
    title: string,
    text: string,      // Full content
    url: string,
    metadata: {        // Optional metadata
      tags: string[],
      createdAt: string,
      modifiedAt: string,
      path: string
    }
  }
}
```

## Compatibility

### Supported ChatGPT Modes

The connector works in any ChatGPT mode where Connectors can be selected:
- GPT-5 Auto
- GPT-5 Fast
- GPT-5 Thinking mini
- GPT-5 Thinking
- Legacy models (where Connectors are available)

### Not Available In

- **GPT-5 Pro**: This mode doesn't currently support Connectors

## Migration Notes

### For Existing v1 Users

If you already have obvec deployed with the v1 migration:
1. Use `wrangler.toml.upgrade` instead of `wrangler.toml.example`
2. The v2 migration only adds `ChatGPTMCP` (not `ObsidianVectorizeMCP`)
3. This avoids Durable Object re-declaration conflicts

### For New Users

Use `wrangler.toml.example` which includes both Durable Objects in the v2 migration.

## Troubleshooting

### ChatGPT finds no results

1. Check the minimum score threshold:
   ```toml
   CHATGPT_MIN_SCORE = "0.2"  # Try lowering if too restrictive
   ```

2. Verify your vault has been indexed:
   ```bash
   obvec stats
   ```

3. Monitor logs during search:
   ```bash
   npx wrangler tail --format pretty
   ```

### QDF not working as expected

1. Verify QDF is enabled:
   ```toml
   CHATGPT_USE_QDF = "true"
   ```

2. Check that your notes have `modifiedAt` metadata

3. Look for QDF logs:
   ```
   Query includes QDF=5 (freshness hint)
   Applying QDF=5 freshness boost for notes modified in last 30 days
   ```

### Authentication issues

1. Ensure `MCP_PASSWORD` is set:
   ```bash
   wrangler secret put MCP_PASSWORD
   ```

2. Try re-adding the connector in ChatGPT

3. Check OAuth logs for errors

## Advanced Usage

### Combining with Other Connectors

ChatGPT can use multiple connectors simultaneously. Your Obsidian vault can complement:
- Gmail for email search
- Google Drive for document search
- Web browsing for current information

### Deep Research Integration

When ChatGPT performs deep research, it automatically includes your Obsidian vault as a knowledge source alongside web search results.

### Custom Vault Names

Set your vault name for proper Obsidian URL generation:
```toml
OBSIDIAN_VAULT_NAME = "MyKnowledgeBase"
```

This ensures generated URLs open correctly in Obsidian.