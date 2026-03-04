import { createHash, randomBytes } from "crypto";

/**
 * Hashes the input data using the SHA-3 (256-bit) algorithm.
 * @param data - The input string to be hashed.
 * @returns The resulting hash as a hexadecimal string.
 */
const sha3Hash = (data: string): string => createHash("sha3-256").update(data).digest("hex");

/**
 * Hashes the input data using the SHA-256 algorithm.
 * @param data - The input data to be hashed. It can be a string or any other type that can be converted to a Buffer.
 * @returns The resulting hash as a hexadecimal string.
 */
const sha256 = (data: any): string => createHash("sha256").update(data).digest("hex");

/**
 * Generates a random token.
 * @param length - The length of the token in bytes. If not provided, defaults to 32 bytes.
 * @returns The generated token as a hexadecimal string.
 */
const tokenCreate = (length?: number): string => randomBytes(length || 32).toString("hex");

export { sha3Hash, sha256, tokenCreate };
