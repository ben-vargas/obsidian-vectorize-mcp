#!/usr/bin/env tsx

import { config } from 'dotenv';
import { argv } from 'process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
config({ path: resolve(__dirname, '../.env') });

async function searchNotes() {
  // Parse command line arguments
  const args = argv.slice(2);
  if (args.length === 0) {
    console.error('❌ Search query required');
    console.log('💡 Usage: obvec search "your search query" [--limit 10] [--json]');
    process.exit(1);
  }

  // Extract query and options
  let query = '';
  let limit = 10;
  let outputJson = false;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--limit' && i + 1 < args.length) {
      limit = parseInt(args[i + 1]);
      i++; // Skip next arg
    } else if (arg === '--json') {
      outputJson = true;
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (!arg.startsWith('--')) {
      query = arg;
    }
  }

  if (!query) {
    console.error('❌ Search query required');
    process.exit(1);
  }

  const workerUrl = process.env.WORKER_URL || 'http://localhost:8787';
  const token = process.env.MCP_PASSWORD;
  
  if (!token) {
    console.error('❌ MCP_PASSWORD environment variable required');
    console.log('💡 Set: export MCP_PASSWORD="your-password"');
    process.exit(1);
  }

  if (!outputJson) {
    console.log(`🔍 Searching for: "${query}"`);
    console.log(`📡 Worker URL: ${workerUrl}`);
    console.log(`📊 Max results: ${limit}\n`);
  }

  try {
    // Call the search API
    const response = await fetch(`${workerUrl}/api/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        query, 
        limit,
        returnContent: verbose 
      })
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as any;
    
    if (outputJson) {
      // JSON output for programmatic use
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Human-readable output
      if (result.results.length === 0) {
        console.log('No results found.');
      } else {
        console.log(`Found ${result.results.length} results:\n`);
        
        result.results.forEach((match: any, index: number) => {
          console.log(`${index + 1}. ${match.title}`);
          console.log(`   📁 ${match.path}`);
          console.log(`   📊 Score: ${(match.score * 100).toFixed(1)}%`);
          
          if (match.tags && Array.isArray(match.tags) && match.tags.length > 0) {
            console.log(`   🏷️  Tags: ${match.tags.join(', ')}`);
          }
          
          if (match.preview) {
            const preview = match.preview.replace(/\n/g, ' ').substring(0, 150);
            console.log(`   📝 ${preview}...`);
          }
          
          if (verbose && match.content) {
            console.log(`\n   Full content:`);
            console.log(`   ${match.content.substring(0, 500)}...\n`);
          }
          
          console.log('');
        });
      }
    }

  } catch (error: any) {
    if (!outputJson) {
      console.error('❌ Search error:', error.message);
    } else {
      console.log(JSON.stringify({ error: error.message }, null, 2));
    }
    process.exit(1);
  }
}

// Run if this is the main module
searchNotes();