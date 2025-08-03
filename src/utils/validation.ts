/**
 * Validates and sanitizes a limit parameter for search/list operations
 * @param limit - The limit value to validate
 * @param defaultValue - Default value if limit is invalid
 * @param maxValue - Maximum allowed value
 * @returns Valid limit between 1 and maxValue
 */
export function validateLimit(
  limit: any,
  defaultValue: number = 10,
  maxValue: number = 50
): number {
  // If undefined or null, use default
  if (limit === undefined || limit === null) {
    return defaultValue;
  }
  
  // Convert to number if string
  const parsed = typeof limit === 'string' ? parseInt(limit, 10) : limit;
  
  // Check if valid number
  if (isNaN(parsed) || !isFinite(parsed)) {
    return defaultValue;
  }
  
  // Ensure it's within valid range
  if (parsed < 1) {
    return 1;
  }
  
  if (parsed > maxValue) {
    return maxValue;
  }
  
  // Return integer value
  return Math.floor(parsed);
}

/**
 * Validates a minimum score parameter
 * @param minScore - The minimum score value to validate
 * @param defaultValue - Default value if minScore is invalid
 * @returns Valid minScore between 0 and 1
 */
export function validateMinScore(
  minScore: any,
  defaultValue: number = 0.7
): number {
  // If undefined or null, use default
  if (minScore === undefined || minScore === null) {
    return defaultValue;
  }
  
  // Convert to number if string
  const parsed = typeof minScore === 'string' ? parseFloat(minScore) : minScore;
  
  // Check if valid number
  if (isNaN(parsed) || !isFinite(parsed)) {
    return defaultValue;
  }
  
  // Ensure it's within valid range (0 to 1)
  if (parsed < 0) {
    return 0;
  }
  
  if (parsed > 1) {
    return 1;
  }
  
  return parsed;
}