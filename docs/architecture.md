# Architecture

## Technical Overview

### Workers AI Integration
- **Models**: `bge-large-en-v1.5` (1024D), `bge-base-en-v1.5` (768D), `bge-small-en-v1.5` (384D)
- **Performance**: 75-150ms embedding generation
- **Cost**: $0 (included with Workers subscription)

### System Architecture
- **Single Worker**: Handles MCP, indexing, and search
- **Cloudflare Vectorize**: Global vector database for semantic search
- **R2 Storage**: Full note content storage with timestamps
- **Workers AI**: Native embedding generation
- **OAuth Provider**: Standards-compliant authentication
- **Dual Transport Support**: Both Streamable HTTP (current spec) and SSE (legacy)
- **Timestamp Tracking**: Creation and modification dates for all notes

## MCP Tools Available
- **search_notes**: Semantic search with filters, date sorting (returns previews)
- **get_note**: Retrieve full note content with timestamps by path or search
- **list_notes**: List notes with path/tag/date filtering and sorting (no vault size limit)
- **analyze_connections**: Find related notes through AI-powered similarity

## Data Flow

### Indexing Process
1. **File Processing**: Markdown files are parsed for content, metadata, and frontmatter
2. **Embedding Generation**: Workers AI creates vector embeddings from content
3. **Vector Storage**: Embeddings stored in Cloudflare Vectorize with metadata
4. **Content Storage**: Full note content stored in R2 for retrieval
5. **Checksum Tracking**: SHA-256 checksums prevent duplicate processing

### Search Process
1. **Query Embedding**: User query converted to vector using Workers AI
2. **Vector Search**: Vectorize performs similarity search across stored embeddings
3. **Content Retrieval**: Full note content fetched from R2 for matching results
4. **Response Assembly**: Results combined with metadata and returned via MCP

## Security Model

### OAuth 2.1 Implementation
- **PKCE Security**: Proof Key for Code Exchange for enhanced security
- **Standards Compliant**: Uses Cloudflare's official OAuth Provider Library
- **Token Storage**: Secure token management via KV namespace
- **Password Protection**: Single password via `MCP_PASSWORD` secret

### Data Protection
- **Encrypted Storage**: All data encrypted at rest in Cloudflare infrastructure
- **Access Control**: OAuth-protected endpoints with bearer token authentication
- **Input Validation**: All user inputs sanitized and validated
- **CORS Configuration**: Appropriate CORS headers for web client access