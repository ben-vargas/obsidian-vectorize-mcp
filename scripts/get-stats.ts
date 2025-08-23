#!/usr/bin/env tsx

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
config({ path: resolve(__dirname, '../.env') });

async function getStats() {
  const workerUrl = process.env.WORKER_URL;
  const token = process.env.MCP_PASSWORD;
  
  if (!workerUrl) {
    console.error('❌ WORKER_URL not configured in .env file');
    console.log('💡 Add WORKER_URL="https://obvec.<your-subdomain>.workers.dev" to .env');
    process.exit(1);
  }
  
  if (!token) {
    console.error('❌ MCP_PASSWORD not configured in .env file');
    console.log('💡 Add MCP_PASSWORD="your-password" to .env');
    process.exit(1);
  }

  console.log('📊 Fetching Obsidian Vectorize MCP statistics...\n');
  console.log('📡 Worker URL:', workerUrl);

  try {
    // Call the stats API
    const response = await fetch(`${workerUrl}/api/stats`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Stats request failed: ${response.status} ${response.statusText}`);
    }

    const stats = await response.json() as any;
    
    // Display stats in a human-readable format
    console.log('\n📊 INDEX STATISTICS');
    console.log('===================');
    console.log(`Vectorize Index: ${stats.vectorize.index}`);
    console.log(`Total Vectors: ${stats.vectorize.count}`);
    console.log(`Dimensions: ${stats.vectorize.dimensions}`);
    
    console.log('\n💾 STORAGE STATISTICS');
    console.log('=====================');
    console.log(`R2 Bucket: ${stats.r2.bucket}`);
    console.log(`Object Count: ${stats.r2.objectCount}`);
    console.log(`Total Size: ${stats.r2.totalSize}`);
    
    if (stats.r2.sampleFiles && stats.r2.sampleFiles.length > 0) {
      console.log('\n📁 SAMPLE FILES');
      console.log('===============');
      stats.r2.sampleFiles.forEach((file: any) => {
        console.log(`  ${file.key} (${file.size})`);
      });
    }

  } catch (error: any) {
    console.error('❌ Stats error:', error.message);
    process.exit(1);
  }
}

// Run if this is the main module
getStats();