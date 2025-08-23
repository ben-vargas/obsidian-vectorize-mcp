# Module System Configuration

This project uses a hybrid module system to support different runtime environments:

## Configuration Overview

- **package.json**: `"type": "commonjs"` - Required for the CLI binary (`bin/obvec.js`)
- **tsconfig.json**: `"module": "ESNext"` - Required for Cloudflare Workers compilation
- **Scripts**: Use ES module syntax with tsx runtime handling

## Why This Setup?

1. **CLI Binary Compatibility**: The `bin/obvec.js` file is a CommonJS module that needs to work with Node.js directly when installed globally via npm.

2. **Cloudflare Workers Requirements**: Cloudflare Workers require ES modules for proper compilation and bundling.

3. **TypeScript Scripts**: The scripts in the `scripts/` directory use ES module syntax (`import.meta.url`, etc.) but are executed via `tsx`, which handles module resolution regardless of the package.json type setting.

## How It Works

- **tsx Runtime**: When running TypeScript files via `tsx`, it automatically handles ES module syntax even when package.json specifies CommonJS.
- **Wrangler Build**: Uses the TypeScript configuration to compile for Cloudflare Workers with ES modules.
- **Node.js CLI**: The `bin/obvec.js` runs as CommonJS for maximum compatibility.

## Files and Their Module Systems

| File/Directory | Module System | Runtime |
|---------------|--------------|---------|
| `bin/obvec.js` | CommonJS | Node.js |
| `src/**/*.ts` | ES Modules | Cloudflare Workers |
| `scripts/**/*.ts` | ES Modules | tsx |

## Development Notes

- All TypeScript files can safely use ES module syntax
- The tsx runtime handles module resolution transparently
- No changes needed when running scripts via npm or directly with tsx
- This configuration is intentional and tested to work correctly

## Testing

All scripts have been tested and work correctly with this configuration:
- `npm run index` - Indexes Obsidian vault
- `npm run dev` - Starts development server
- `npm run build` - Builds for Cloudflare Workers
- Direct script execution via tsx also works