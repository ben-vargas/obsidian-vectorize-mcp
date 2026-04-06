#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const command = process.argv[2];
const passthroughArgs = process.argv.slice(3);

if (!command) {
  console.error('Missing Wrangler command.');
  process.exit(1);
}

const runtimeConfig = path.join(rootDir, 'wrangler.toml');
const buildConfig = path.join(rootDir, 'wrangler.jsonc');
const explicitConfig = process.env.WRANGLER_CONFIG;

function resolveConfig(commandName) {
  if (explicitConfig) {
    return explicitConfig;
  }

  if (commandName === 'build') {
    return buildConfig;
  }

  if (commandName === 'types') {
    if (fs.existsSync(runtimeConfig)) {
      return runtimeConfig;
    }
    return buildConfig;
  }

  if (commandName === 'login') {
    return null;
  }

  if (!fs.existsSync(runtimeConfig)) {
    console.error('Missing wrangler.toml.');
    console.error('Copy wrangler.toml.example to wrangler.toml and fill in your Cloudflare resource IDs before running this command.');
    process.exit(1);
  }

  return runtimeConfig;
}

const args = ['wrangler', command];
const configPath = resolveConfig(command);

if (configPath) {
  args.push('--config', configPath);
}

args.push(...passthroughArgs);

const result = spawnSync('npx', args, {
  cwd: rootDir,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
