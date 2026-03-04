/**
 * Splits an array into smaller arrays (batches) of a specified size.
 *
 * This utility function is useful for processing large datasets in smaller chunks,
 * which can help with memory management, API rate limiting, or parallel processing.
 *
 * @template T - The type of elements in the input array
 * @param array - The input array to be split into batches
 * @param batchSize - The maximum number of elements per batch (must be positive)
 * @returns An array of arrays, where each sub-array contains at most `batchSize` elements
 *
 * @throws Will not throw but returns empty array if input array is empty
 */
export function batchArray<T>(array: T[], batchSize: number): T[][] {
  // Initialize empty array to store the batches
  const batches: T[][] = [];
  
  // Iterate through the array in steps of batchSize
  for (let i = 0; i < array.length; i += batchSize) {
    // Extract a slice from current position to current position + batchSize
    // slice() handles the case where i + batchSize exceeds array length
    batches.push(array.slice(i, i + batchSize));
  }
  
  return batches;
}
