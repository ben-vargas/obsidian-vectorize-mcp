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
  
  try {
    if (!env.AI) {
      throw new Error('AI binding not available');
    }
    
    if (!texts || texts.length === 0) {
      throw new Error('No texts provided for embedding generation');
    }
    
    const response = await env.AI.run(model as any, {
      text: texts
    }) as any;
    
    // Validate response structure
    if (!response || !response.data) {
      throw new Error('Invalid AI response: missing data field');
    }
    
    if (!Array.isArray(response.data)) {
      throw new Error('Invalid AI response: data is not an array');
    }
    
    // Validate array length matches input
    if (response.data.length !== texts.length) {
      throw new Error(`AI response length mismatch: expected ${texts.length}, got ${response.data.length}`);
    }
    
    // Validate each embedding is an array of numbers
    for (let i = 0; i < response.data.length; i++) {
      if (!Array.isArray(response.data[i])) {
        throw new Error(`Invalid embedding at index ${i}: not an array`);
      }
      if (response.data[i].length === 0) {
        throw new Error(`Invalid embedding at index ${i}: empty array`);
      }
    }
    
    return response.data;
  } catch (error: any) {
    throw new Error(`Failed to generate embeddings: ${error.message}`);
  }
}