export function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost >= 0.01) return `$${cost.toFixed(2)}`;
  if (cost >= 0.001) return `$${cost.toFixed(3)}`;
  if (cost >= 0.000001) return `$${cost.toFixed(6)}`;
  // For extremely small values, use scientific notation
  return `$${cost.toExponential(2)}`;
}