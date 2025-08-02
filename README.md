# Obsidian Vectorize MCP

A modern, serverless solution for indexing Obsidian notes using Cloudflare's official OAuth 2.1 pattern, Vectorize, and Workers AI, with native Model Context Protocol (MCP) support.

## 🚀 Key Features

- **Cost Effective**: ~$0-10/month for typical personal use (250 - 2.5k Notes)
- **Affordable Embedding Costs**: Workers AI embedding models used - no OpenAI API fees needed
- **Official Cloudflare OAuth 2.1**: Uses `@cloudflare/workers-oauth-provider`
- **Standards Compliant**: Follows MCP v2025-03-26 specification with Streamable HTTP transport
- **Global Edge Performance**: 300+ locations worldwide
- **Serverless Simplicity**: No infrastructure management required
- **15-Minute Setup**: Get running quickly with simple commands

## 🚀 Quick Start

### 1. Clone & Setup

> **Note**: This project requires git clone to access all necessary configuration files and source code for deployment.

```bash
# Clone the repository
git clone https://github.com/ben-vargas/obsidian-vectorize-mcp.git
cd obsidian-vectorize-mcp

# Install obvec CLI globally (includes all dependencies)
npm install -g .

# Copy and configure wrangler.toml
cp wrangler.toml.example wrangler.toml

# Login to Cloudflare
obvec login

# Create KV namespaces
wrangler kv:namespace create kv
wrangler kv:namespace create oauth_tokens
# Update wrangler.toml with the returned namespace IDs

# Create R2 bucket
wrangler r2 bucket create obsidian-vectorize

# Set your password
wrangler secret put MCP_PASSWORD
```

### 2. Deploy & Index

#### Option A: Deploy to Cloudflare (Recommended)
```bash
# Deploy your MCP server
obvec deploy

# Create and configure .env file (required)
cp .env.example .env
# Edit .env with:
# WORKER_URL=https://obvec.<your-cloudflare-subdomain>.workers.dev
# MCP_PASSWORD=your-secure-password-here
# OBSIDIAN_VAULT_PATH=/path/to/your/vault

# Index your vault
obvec index
```

#### Option B: Local Development
```bash
# Create .dev.vars for local Worker environment
echo "MCP_PASSWORD=your-local-password" > .dev.vars

# Create .env for CLI scripts
cp .env.example .env
# Edit .env with:
# WORKER_URL=http://localhost:8787
# MCP_PASSWORD=your-local-password
# OBSIDIAN_VAULT_PATH=/path/to/vault

# Start local development server
obvec dev

# In another terminal, index your vault
obvec index
```

### 3. Connect to MCP Clients

> **Note about Connectors**: Claude.ai uses "Connectors" to integrate with MCP servers. If you add a Connector on claude.ai (Web), it will also appear in Claude Desktop - no additional configuration needed. However, Claude Code requires separate MCP configuration.

#### claude.ai (Web) & Claude Desktop
On [claude.ai](https://claude.ai), add a custom MCP Connector:
1. Go to Settings → Connectors
2. Click "Add Custom Connector"
3. Enter your MCP endpoint:
   - **Streamable HTTP**: `https://obvec.<account_subdomain>.workers.dev/mcp` (recommended - current MCP spec)
   - **SSE**: `https://obvec.<account_subdomain>.workers.dev/sse` (deprecated - for backward compatibility)

**Note**: The MCP specification deprecated SSE on March 26, 2025. We recommend using the Streamable HTTP endpoint.

When you first connect, a browser window will open for OAuth authentication. Enter your password to authorize access. This Connector will automatically sync to your Claude Desktop app.

#### Claude Code (CLI)
Add via command line:
```bash
claude mcp add -s user -t http obvec https://obvec.<account_subdomain>.workers.dev/mcp
```

Breaking this down:
- `claude mcp add` - The command to add an MCP server
- `-s user` - Scope set to "user" (applies to all your projects, not just the current one)
- `-t http` - Transport type for the new Streamable HTTP protocol
- `obvec` - The name you want to give the server
- `https://obvec.<account_subdomain>.workers.dev/mcp` - The URL of your MCP endpoint

#### Manual Claude Desktop Configuration (Optional)
If you prefer to configure Claude Desktop directly instead of using Connectors, add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "obvec": {
      "type": "http",
      "url": "https://obvec.<account_subdomain>.workers.dev/mcp"
    }
  }
}
```

Replace `<account_subdomain>` with your actual Cloudflare Workers subdomain in all examples.

## 🔐 Authentication & Security

### OAuth 2.1 Flow
- **Standards Compliant**: Uses Cloudflare's official OAuth Provider Library
- **PKCE Security**: Proof Key for Code Exchange for enhanced security
- **Simple Setup**: One password via `wrangler secret put MCP_PASSWORD`
- **MCP Compatible**: Works with claude.ai, Claude Desktop, Cursor, Windsurf out of the box

### For Repository Cloners/Forkers
Each person who clones this repo gets:
- Their own Worker deployment and URL
- Their own password protection (`MCP_PASSWORD` secret)
- Their own OAuth KV namespace
- Complete isolation from other deployments

## 📁 Project Structure

```
obvec/
├── bin/
│   └── obvec.js                     # CLI executable
├── docs/                            # Documentation
│   ├── advanced-configuration.md    # Smart re-indexing and OAuth setup
│   ├── architecture.md              # Technical architecture details
│   ├── mcp-implementation.md        # MCP protocol details
│   ├── pricing-and-performance.md   # Cost analysis and performance info
│   └── troubleshooting.md           # Common issues and diagnostics
├── scripts/
│   ├── index-vault.ts               # Vault indexing script
│   ├── search-notes.ts              # CLI search utility
│   ├── get-stats.ts                 # Index statistics
│   ├── reset-index.ts               # Clear all indexed data
│   └── cleanup-orphaned.ts          # Remove deleted notes
├── src/
│   ├── api/                         # API endpoints
│   ├── auth/                        # Authentication UI
│   ├── mcp/                         # MCP server implementation
│   ├── types/                       # TypeScript types
│   └── index.ts                     # Main Worker entry
├── .env.example                     # Environment variables template
├── .gitignore                       # Git ignore patterns
├── .mcp.json.example                # MCP configuration example
├── LICENSE                          # MIT License
├── README.md                        # This file
├── package.json                     # NPM package config
├── tsconfig.json                    # TypeScript config
└── wrangler.toml.example            # Cloudflare Worker config template
```

## 🛠️ CLI Commands

### Core Operations
```bash
obvec login        # Login to Cloudflare (alias for wrangler login)
obvec deploy       # Deploy to production (alias for wrangler deploy)
obvec dev          # Start local development (alias for wrangler dev)
```

### Vault Management
```bash
obvec index        # Index your Obsidian vault
obvec search "AI"  # Search your notes from CLI
obvec reset        # Clear and reset the entire index
obvec cleanup      # Remove orphaned notes (deleted from vault)
obvec info         # Show MCP connection information
```

#### Search Options
```bash
# Basic search
obvec search "machine learning"

# Limit results
obvec search "productivity" --limit 20

# JSON output for scripting
obvec search "meetings" --json

# Verbose mode (includes up to 1000 chars from vectorize index)
obvec search "projects" --verbose
```

### Authentication
```bash
# Set your MCP password
wrangler secret put MCP_PASSWORD

# Create OAuth KV namespace  
wrangler kv:namespace create oauth_tokens

# View deployment logs
wrangler tail
```

## 🔍 Troubleshooting

For common issues and debugging tips, see [docs/troubleshooting.md](docs/troubleshooting.md).

## 📊 Performance & Costs

For detailed pricing information, free tier limits, and cost scenarios, see [docs/pricing-and-performance.md](docs/pricing-and-performance.md).


## ☁️ Cloudflare Resources Overview

This project automatically creates and configures the following Cloudflare resources:

- **Vectorize Index**: `obsidian-notes` (1024 dimensions, cosine similarity)
- **KV Namespaces**: OAuth token storage and caching
- **R2 Bucket**: Full note content storage and retrieval  
- **Workers AI**: Embedding generation (included with Workers subscription)

These resources are created during the setup process and work together to provide semantic search across your Obsidian vault.

## 🔧 Advanced Configuration

For advanced features like smart re-indexing, timestamp queries, custom embedding models, and OAuth configuration, see [docs/advanced-configuration.md](docs/advanced-configuration.md).

## 📚 Documentation

For detailed guides, see:
- **[Architecture](docs/architecture.md)** - Technical implementation details
- **[Advanced Configuration](docs/advanced-configuration.md)** - Power user features
- **[Pricing & Performance](docs/pricing-and-performance.md)** - Cost analysis and limits
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues and debugging
- **[MCP Implementation](docs/mcp-implementation.md)** - MCP protocol details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch  
3. Test with your own Obsidian vault
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details