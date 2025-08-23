#!/usr/bin/env tsx

import { readdir, readFile } from 'fs/promises';
import { join, extname, relative } from 'path';

async function findMarkdownFiles(dir: string, basePath: string = dir): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        const subFiles = await findMarkdownFiles(fullPath, basePath);
        files.push(...subFiles);
      }
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      files.push(relative(basePath, fullPath));
    }
  }

  return files;
}

async function cleanupOrphaned() {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  
  if (!vaultPath) {
    console.error('❌ OBSIDIAN_VAULT_PATH environment variable is required');
    console.log('💡 Run: export OBSIDIAN_VAULT_PATH="/path/to/your/vault"');
    process.exit(1);
  }

  const workerUrl = process.env.WORKER_URL || 'http://localhost:8787';
  const token = process.env.MCP_PASSWORD;
  
  if (!token) {
    console.error('❌ MCP_PASSWORD environment variable required');
    console.log('💡 Set: export MCP_PASSWORD="your-password"');
    process.exit(1);
  }

  console.log('🧹 Starting cleanup of orphaned notes...\n');
  console.log('📁 Vault path:', vaultPath);
  console.log('📡 Worker URL:', workerUrl);

  try {
    // Step 1: Get all files currently in vault
    console.log('\n1️⃣ Scanning vault for current files...');
    const vaultFiles = await findMarkdownFiles(vaultPath);
    const vaultFilesSet = new Set(vaultFiles);
    console.log(`   Found ${vaultFiles.length} markdown files in vault`);

    // Step 2: Get all files stored in the index
    console.log('\n2️⃣ Fetching indexed files from server...');
    const response = await fetch(`${workerUrl}/api/list-indexed`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch indexed files: ${response.status} ${response.statusText}`);
    }

    const { files: indexedFiles } = await response.json() as any;
    console.log(`   Found ${indexedFiles.length} files in index`);

    // Step 3: Find orphaned files
    console.log('\n3️⃣ Identifying orphaned files...');
    const orphanedFiles = indexedFiles.filter((file: string) => !vaultFilesSet.has(file));
    
    if (orphanedFiles.length === 0) {
      console.log('   ✅ No orphaned files found! Index is in sync with vault.');
      return;
    }

    console.log(`   ⚠️  Found ${orphanedFiles.length} orphaned files:\n`);
    orphanedFiles.forEach((file: string) => {
      console.log(`      - ${file}`);
    });

    // Step 4: Confirm deletion
    console.log('\n4️⃣ Confirm cleanup');
    const confirmResponse = await new Promise<string>((resolve) => {
      console.log(`\nDo you want to remove these ${orphanedFiles.length} orphaned files from the index? (yes/no): `);
      
      process.stdin.once('data', (data) => {
        const answer = data.toString().trim().toLowerCase();
        process.stdin.pause();
        resolve(answer);
      });
    });

    if (confirmResponse !== 'yes' && confirmResponse !== 'y') {
      console.log('❌ Cleanup cancelled.');
      process.exit(0);
    }

    // Step 5: Delete orphaned files
    console.log('\n5️⃣ Removing orphaned files...');
    const deleteResponse = await fetch(`${workerUrl}/api/cleanup`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ files: orphanedFiles })
    });

    if (!deleteResponse.ok) {
      throw new Error(`Failed to delete files: ${deleteResponse.status} ${deleteResponse.statusText}`);
    }

    const result = await deleteResponse.json() as any;
    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Removed ${result.deletedCount} orphaned files from index`);

  } catch (error: any) {
    console.error('\n❌ Error during cleanup:', error.message);
    process.exit(1);
  }
}

// Run if this is the main module
cleanupOrphaned();