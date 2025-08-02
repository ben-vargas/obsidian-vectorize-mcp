#!/usr/bin/env tsx

import { config } from 'dotenv';
import { readdir, readFile, stat } from 'fs/promises';
import { join, extname, relative, resolve, normalize } from 'path';

// Load environment variables from .env file
config({ path: resolve(__dirname, '../.env') });

interface NoteData {
  path: string;
  title: string;
  content: string;
  tags: string[];
  frontmatter?: Record<string, any>;
  createdAt?: string;
  modifiedAt?: string;
}

function isPathSafe(basePath: string, targetPath: string): boolean {
  const resolvedBase = resolve(normalize(basePath));
  const resolvedTarget = resolve(normalize(join(basePath, targetPath)));
  
  // Ensure the resolved target path starts with the base path
  return resolvedTarget.startsWith(resolvedBase + '/') || resolvedTarget === resolvedBase;
}

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

function extractFrontmatter(content: string): { frontmatter: Record<string, any> | undefined; content: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { frontmatter: undefined, content };
  }

  try {
    const yamlContent = match[1];
    const frontmatter: Record<string, any> = {};
    
    yamlContent.split('\n').forEach(line => {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        
        if (value.startsWith('[') && value.endsWith(']')) {
          frontmatter[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/"/g, ''));
        } else {
          frontmatter[key] = value.replace(/"/g, '');
        }
      }
    });

    const contentWithoutFrontmatter = content.replace(frontmatterRegex, '');
    return { frontmatter, content: contentWithoutFrontmatter };
  } catch (error) {
    console.warn(`Failed to parse frontmatter: ${error}`);
    return { frontmatter: undefined, content };
  }
}

function extractTags(content: string, frontmatter?: Record<string, any>): string[] {
  const tags = new Set<string>();
  
  if (frontmatter?.tags) {
    const fmTags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [frontmatter.tags];
    fmTags.forEach(tag => tags.add(tag));
  }

  const inlineTagRegex = /#[\w-]+/g;
  const matches = content.match(inlineTagRegex);
  if (matches) {
    matches.forEach(match => tags.add(match.substring(1)));
  }

  return Array.from(tags);
}

async function processNote(filePath: string, vaultPath: string): Promise<NoteData> {
  // Validate the path to prevent directory traversal
  if (!isPathSafe(vaultPath, filePath)) {
    throw new Error(`Security Error: Invalid file path detected: ${filePath}`);
  }
  
  const fullPath = join(vaultPath, filePath);
  const content = await readFile(fullPath, 'utf-8');
  const { frontmatter, content: cleanContent } = extractFrontmatter(content);
  
  // Get file stats for timestamps
  const stats = await stat(fullPath);
  const createdAt = stats.birthtime.toISOString();
  const modifiedAt = stats.mtime.toISOString();
  
  const title = frontmatter?.title || 
                filePath.replace(/\.md$/, '').split('/').pop() || 
                'Untitled';
  
  const tags = extractTags(cleanContent, frontmatter);
  
  return {
    path: filePath,
    title,
    content: cleanContent,
    tags,
    frontmatter,
    createdAt,
    modifiedAt
  };
}

async function indexVault(vaultPath: string, workerUrl: string) {
  console.log(`🚀 Starting to index vault: ${vaultPath}`);
  console.log(`📡 Worker URL: ${workerUrl}`);

  try {
    const mdFiles = await findMarkdownFiles(vaultPath);
    console.log(`📁 Found ${mdFiles.length} markdown files`);

    if (mdFiles.length === 0) {
      console.log('❌ No markdown files found in vault');
      return;
    }

    const batchSize = 10;
    let processed = 0;
    let failed = 0;

    for (let i = 0; i < mdFiles.length; i += batchSize) {
      const batch = mdFiles.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(mdFiles.length / batchSize)}`);

      try {
        const notes: NoteData[] = [];
        
        for (const filePath of batch) {
          try {
            const note = await processNote(filePath, vaultPath);
            notes.push(note);
          } catch (error: any) {
            console.warn(`⚠️  Failed to process ${filePath}: ${error.message}`);
            failed++;
          }
        }

        if (notes.length > 0) {
          const token = process.env.MCP_PASSWORD;
          if (!token) {
            console.error('❌ MCP_PASSWORD environment variable required for indexing');
            console.log('💡 Set: export MCP_PASSWORD="your-password"');
            console.log('   Use the same password you set with: npx wrangler secret put MCP_PASSWORD');
            process.exit(1);
          }

          const response = await fetch(`${workerUrl}/api/index`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ notes })
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const result = await response.json() as { 
            success?: boolean; 
            indexed?: number; 
            r2Updated?: number; 
            r2Skipped?: number; 
            message?: string;
            error?: string;
          };
          
          if (result.success && result.indexed) {
            processed += result.indexed;
            if (result.message) {
              console.log(`   ✓ ${result.message}`);
            }
          } else {
            failed += batch.length;
            if (result.error) {
              console.warn(`   ⚠️  Error: ${result.error}`);
            }
          }
        }

        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error: any) {
        console.error(`❌ Batch processing failed: ${error.message}`);
        failed += batch.length;
      }
    }

    console.log(`\n✅ Indexing complete!`);
    console.log(`📊 Processed: ${processed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success rate: ${((processed / (processed + failed)) * 100).toFixed(1)}%`);

  } catch (error: any) {
    console.error(`❌ Failed to index vault: ${error.message}`);
    process.exit(1);
  }
}

async function main() {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  const workerUrl = process.env.WORKER_URL || 'http://localhost:8787';

  if (!vaultPath) {
    console.error('❌ OBSIDIAN_VAULT_PATH environment variable is required');
    console.log('💡 Example: OBSIDIAN_VAULT_PATH=/path/to/vault npm run index');
    process.exit(1);
  }

  try {
    const vaultStat = await stat(vaultPath);
    if (!vaultStat.isDirectory()) {
      console.error('❌ OBSIDIAN_VAULT_PATH must be a directory');
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Cannot access vault path: ${vaultPath}`);
    process.exit(1);
  }

  await indexVault(vaultPath, workerUrl);
}

if (require.main === module) {
  main().catch(console.error);
}