# Pricing & Performance

> **Note**: Pricing and limits are subject to change. Please check [Cloudflare's official pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) for the most current information.

## Workers AI Limits
- **Free Tier**: 10,000 neurons per day (included with all accounts)
- **Embeddings**: ~1,250 embeddings per 1,000 neurons
- **Daily Free Embeddings**: ~12,500 embeddings
- **Exceeding Limits**: $0.011 per 1,000 additional neurons

For most personal Obsidian vaults:
- **Small vaults (<300 notes)**: May stay within daily free tier (10k neurons)
- **Medium vaults (300-1,000 notes)**: Will likely exceed free tier during initial indexing
- **Large vaults (1,000+ notes)**: Workers subscription ($5/month) recommended plus usage costs

**Note**: Initial indexing neuron usage varies significantly based on note size and content. After initial indexing, daily usage is minimal unless you're frequently re-indexing (*depending on note creation volume and embedding model*).

## Storage Costs & Free Tiers

**R2 Storage (Standard)**:
- **Free Tier**: 10 GB-month storage, 1M Class A operations, 10M Class B operations
- **After Free Tier**: $0.015/GB-month storage, $4.50/million Class A ops, $0.36/million Class B ops
- **Typical Usage**: Most vaults stay within free tier (indexing = Class A writes, searches = Class B reads)

**Vectorize Storage**:
- **Free Tier (Workers Free)**: 5M stored dimensions, 30M queried dimensions/month
- **Free Tier (Workers Paid)**: 10M stored dimensions, 50M queried dimensions/month included
- **After Free Tier**: $0.05/100M stored dimensions, $0.01/M queried dimensions
- **Dimension Calculation**: vectors × dimensions (e.g., 1,000 notes × 1,024 dims = 1M dimensions)

## Example Cost Scenarios

**Small Vault (200 notes, ~20MB)**:
- Storage: Free (well within R2 and Vectorize free tiers)
- Initial indexing: ~8,000 neurons (within daily free tier)
- **Total**: $0/month

**Medium Vault (500 notes, ~100MB)**:
- Storage: Free (within all free tiers)
- Initial indexing: ~20,000 neurons (exceeds daily free tier, ~$0.11 one-time)
- **Total**: $0/month after initial indexing

**Large Vault (5,000 notes, ~1GB)**:
- Storage: Free R2, 5.1M dimensions in Vectorize (requires Workers Paid)
- Initial indexing: ~200,000 neurons (~$2 one-time cost)
- **Total**: $5/month for Workers Paid plan