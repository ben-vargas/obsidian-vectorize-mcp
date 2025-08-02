#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const command = process.argv[2];
const args = process.argv.slice(3);

const commands = {
  'help': () => showHelp(),
  'version': () => showVersion(),
  'login': () => runWrangler('login'),
  'deploy': () => runWrangler('deploy'),
  'dev': () => runWrangler('dev'),
  'build': () => runWrangler('build'),
  'index': () => runScript('index-vault.ts'),
  'reset': () => runScript('reset-index.ts'),
  'cleanup': () => runScript('cleanup-orphaned.ts'),
  'search': () => runSearchScript(),
  'stats': () => runScript('get-stats.ts'),
  'logs': () => runWrangler('tail'),
  'resources': () => listResources(),
  'info': () => showMCPInfo()
};

function showHelp() {
  console.log(`
🚀 OBVEC - Obsidian Vectorize MCP CLI

USAGE:
  obvec <command> [options]

COMMANDS:
  deploy      Deploy MCP Agent to Cloudflare
  dev         Start local development server
  build       Build the Worker bundle
  
  index       Index your Obsidian vault
  search      Search your indexed notes
  reset       Reset/clear the Vectorize index
  cleanup     Remove orphaned notes from index
  stats       Show storage statistics and cost breakdown
  info        Show MCP connection information
  
  login       Login to Cloudflare
  logs        View Worker logs (tail)
  resources   List Cloudflare resources
  
  version     Show version
  help        Show this help

EXAMPLES:
  obvec deploy                   # Deploy MCP Agent to production
  obvec index                    # Index vault (requires OBSIDIAN_VAULT_PATH)
  obvec search "query"           # Search your indexed notes
  obvec stats                    # Show storage and cost statistics
  obvec info                     # Show MCP server connection details
  obvec dev                      # Start local development

ENVIRONMENT VARIABLES:
  OBSIDIAN_VAULT_PATH    Path to your Obsidian vault
  CLOUDFLARE_API_TOKEN   Cloudflare API token (optional)

INTEGRATION:
After deployment, use the MCP server URL with Claude Desktop or other MCP clients.
The server will be available at: https://your-worker.workers.dev/

For more help: https://github.com/ben-vargas/obsidian-vectorize-mcp#readme
`);
}

function showVersion() {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  console.log(`obvec v${pkg.version}`);
  console.log(`AI-powered Obsidian knowledge base with Cloudflare Vectorize and MCP support`);
}

function runWrangler(cmd) {
  try {
    const command = `npx wrangler ${cmd}`;
    console.log(`🔧 Running: ${command}`);
    execSync(command, { stdio: 'inherit', cwd: __dirname + '/..' });
  } catch (error) {
    console.error('❌ Command failed:', error.message);
    process.exit(1);
  }
}

function runScript(scriptName) {
  try {
    const scriptPath = path.join(__dirname, '..', 'scripts', scriptName);
    const command = `npx tsx "${scriptPath}"`;
    console.log(`📜 Running: ${command}`);
    execSync(command, { stdio: 'inherit', cwd: __dirname + '/..' });
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }
}

function runSearchScript() {
  try {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'search-notes.ts');
    const searchArgs = args.map(arg => `"${arg}"`).join(' ');
    const command = `npx tsx "${scriptPath}" ${searchArgs}`;
    execSync(command, { stdio: 'inherit', cwd: __dirname + '/..' });
  } catch (error) {
    console.error('❌ Search failed:', error.message);
    process.exit(1);
  }
}

function listResources() {
  console.log('📋 Listing Cloudflare resources...\\n');
  
  try {
    console.log('🗂️  Vectorize Indexes:');
    execSync('npx wrangler vectorize list', { stdio: 'inherit' });
    
    console.log('\\n🔑 KV Namespaces:');
    execSync('npx wrangler kv:namespace list', { stdio: 'inherit' });
    
    console.log('\\n🪣 R2 Buckets:');
    execSync('npx wrangler r2 bucket list', { stdio: 'inherit' });
    
    console.log('\\n🤖 Durable Objects:');
    execSync('npx wrangler d1 list', { stdio: 'inherit' });
    
  } catch (error) {
    console.error('❌ Failed to list resources:', error.message);
    console.log('💡 Make sure you are logged in: obvec login');
    process.exit(1);
  }
}

function showMCPInfo() {
  console.log(`
🔗 OBVEC MCP Server Information

DEPLOYMENT:
After running 'obvec deploy', your MCP server will be available at:
  https://your-worker-name.workers.dev/

MCP CLIENT CONFIGURATION:
Add this to your Claude Desktop configuration (claude_desktop_config.json):

{
  "mcpServers": {
    "obvec": {
      "type": "sse",
      "url": "https://your-worker-name.workers.dev/sse"
    }
  }
}

AVAILABLE TOOLS:
- search_notes: Search through your Obsidian notes semantically
- get_note: Retrieve a specific note by path or search term
- list_notes: List notes with optional filtering by tags/path
- analyze_connections: Find notes related to a specific topic

AUTHENTICATION:
Uses OAuth 2.1 with password authentication.
Set your password with: wrangler secret put MCP_PASSWORD
The MCP client will prompt for authentication when connecting.

STATE & PERSISTENCE:
- Each MCP client session has its own durable state
- Search history and preferences are automatically maintained
- Sessions can hibernate to save resources when not in use

For setup help: obvec help
For deployment: obvec deploy
`);
}

// Main execution
if (!command || command === 'help') {
  showHelp();
  process.exit(0);
}

if (commands[command]) {
  commands[command]();
} else {
  console.error(`❌ Unknown command: ${command}`);
  console.log('💡 Run "obvec help" to see available commands');
  process.exit(1);
}