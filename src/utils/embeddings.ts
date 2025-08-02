import { Env } from '../types';

export function getEmbeddingDimensions(env: Env): number {
  const dimensions = env.EMBEDDING_DIMENSIONS;
  if (dimensions) {
    return parseInt(dimensions, 10);
  }
  
  const model = env.EMBEDDING_MODEL || '@cf/baai/bge-large-en-v1.5';
  if (model.includes('bge-large')) return 1024;
  if (model.includes('bge-base')) return 768;
  if (model.includes('bge-small')) return 384;
  
  return 1024;
}

export async function generateEmbedding(text: string, env: Env): Promise<number[]> {
  const model = env.EMBEDDING_MODEL || '@cf/baai/bge-large-en-v1.5';
  
  try {
    if (!env.AI) {
      throw new Error('AI binding not available');
    }
    
    const response = await env.AI.run(model as any, {
      text: [text]
    }) as any;
    
    if (!response || !response.data || !response.data[0]) {
      throw new Error('Invalid AI response: ' + JSON.stringify(response));
    }
    
    return response.data[0];
  } catch (error: any) {
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

export async function generateEmbeddings(texts: string[], env: Env): Promise<number[][]> {
  const model = env.EMBEDDING_MODEL || '@cf/baai/bge-large-en-v1.5';
  const response = await env.AI.run(model as any, {
    text: texts
  }) as any;
  
  return response.data;
}