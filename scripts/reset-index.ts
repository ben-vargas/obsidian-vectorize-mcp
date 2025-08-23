#!/usr/bin/env tsx

import { config } from 'dotenv';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
config({ path: resolve(__dirname, '../.env') });

async function resetIndex() {
  console.log('🧹 Resetting Obsidian Vectorize Index...\n');
  
  const response = await new Promise<string>((resolve) => {
    console.log('⚠️  WARNING: This will delete ALL indexed notes from Vectorize!');
    console.log('You will need to re-index your vault after this operation.\n');
    console.log('Do you want to continue? (yes/no): ');
    
    process.stdin.once('data', (data) => {
      const answer = data.toString().trim().toLowerCase();
      process.stdin.pause();
      resolve(answer);
    });
  });
  
  if (response !== 'yes' && response !== 'y') {
    console.log('❌ Reset cancelled.');
    process.exit(0);
  }
  
  try {
    console.log('\n1. Deleting Vectorize index...');
    execSync('npx wrangler vectorize delete obsidian-notes --force', { stdio: 'inherit' });
    
    console.log('\n2. Waiting for deletion to complete...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('\n3. Recreating Vectorize index...');
    execSync('npx wrangler vectorize create obsidian-notes --dimensions=1024 --metric=cosine', { stdio: 'inherit' });
    
    console.log('\n✅ Index reset complete!');
    console.log('\n📝 Next steps:');
    console.log('1. Restart your dev server: npx wrangler dev --experimental-vectorize-bind-to-prod');
    console.log('2. Re-index your vault: obvec index');
    
  } catch (error: any) {
    console.error('\n❌ Error resetting index:', error.message);
    console.log('\n🔧 Manual cleanup steps:');
    console.log('1. Delete index: npx wrangler vectorize delete obsidian-notes --force');
    console.log('2. Recreate index: npx wrangler vectorize create obsidian-notes --dimensions=1024 --metric=cosine');
    process.exit(1);
  }
}

// Run if this is the main module
resetIndex();