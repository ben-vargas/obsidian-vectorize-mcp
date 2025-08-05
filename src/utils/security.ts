import crypto from 'crypto';

/**
 * Escapes HTML special characters to prevent XSS attacks
 */
export function escapeHtml(str: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };
  
  return String(str).replace(/[&<>"'`=/]/g, (char) => htmlEntities[char]);
}

/**
 * Validates and sanitizes file paths to prevent directory traversal attacks
 */
export function sanitizePath(path: string): string {
  // Remove any null bytes
  let sanitized = path.replace(/\0/g, '');
  
  // Remove directory traversal patterns
  sanitized = sanitized.replace(/\.\./g, '');
  sanitized = sanitized.replace(/\.\/\//g, '');
  
  // Remove leading slashes and dots
  sanitized = sanitized.replace(/^[\/\.]+/, '');
  
  // Normalize multiple slashes to single slash
  sanitized = sanitized.replace(/\/+/g, '/');
  
  // Remove trailing slashes
  sanitized = sanitized.replace(/\/$/, '');
  
  // Limit path length
  if (sanitized.length > 255) {
    throw new Error('Path too long (max 255 characters)');
  }
  
  // Ensure path doesn't start with sensitive prefixes
  const blockedPrefixes = ['/', '~', '..', '.'];
  for (const prefix of blockedPrefixes) {
    if (sanitized.startsWith(prefix)) {
      sanitized = sanitized.substring(prefix.length);
    }
  }
  
  // Validate characters - allow common filename characters including spaces
  // Disallow only dangerous characters that could cause security issues
  const dangerousChars = /[\x00-\x1f\x7f<>:"|?*\\]/;
  if (dangerousChars.test(sanitized)) {
    throw new Error('Path contains invalid characters');
  }
  
  return sanitized;
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Generates a CSRF token
 */
export async function generateCSRFToken(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Stores CSRF token in KV with expiration
 */
export async function storeCSRFToken(token: string, kv: any): Promise<void> {
  const key = `csrf:${token}`;
  await kv.put(key, 'valid', {
    expirationTtl: 3600 // 1 hour expiration
  });
}

/**
 * Validates CSRF token
 */
export async function validateCSRFToken(token: string | undefined, kv: any): Promise<boolean> {
  if (!token) {
    return false;
  }
  
  const key = `csrf:${token}`;
  const value = await kv.get(key);
  
  // Delete token after use (one-time use)
  if (value) {
    await kv.delete(key);
  }
  
  return value === 'valid';
}