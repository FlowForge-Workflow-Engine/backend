/**
 * Calculates pagination parameters for database queries
 *
 * @description Converts page-based pagination parameters into skip/take format
 * commonly used by ORMs like TypeORM. Handles the conversion from 1-based page
 * numbering to 0-based skip offset.
 *
 * @param page - The page number (1-based). Defaults to 1 if not provided or 0
 * @param limit - The number of items per page. Defaults to 10
 *
 * @returns Object containing skip and take values for database queries
 * @returns {number} skip - Number of records to skip (offset)
 * @returns {number} take - Number of records to take (limit)
 *
 * @example
 * ```typescript
 * // Get first page with 10 items
 * const { skip, take } = pagination(1, 10);
 * // Returns: { skip: 0, take: 10 }
 *
 * // Get second page with 20 items
 * const { skip, take } = pagination(2, 20);
 * // Returns: { skip: 20, take: 20 }
 *
 * // Use with TypeORM
 * const users = await userRepository.find({
 *   skip,
 *   take,
 *   order: { createdAt: 'DESC' }
 * });
 * ```
 *
 * @since 1.0.0
 */
export const pagination = (page: number = 1, limit: number = 10) => {
  // Ensure page is at least 1 to prevent negative skip values
  const safePage = Math.max(1, page);
  return { skip: (safePage - 1) * limit, take: limit };
};
