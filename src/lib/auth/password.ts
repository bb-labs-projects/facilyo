import * as argon2 from 'argon2';
import crypto from 'crypto';

// Argon2id configuration as per security requirements
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};

/**
 * Hash a password using Argon2id
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Generate a secure temporary password
 * Uses cryptographically secure random bytes
 */
export function generateTempPassword(length: number = 16): string {
  // Characters that are easy to read and type (avoiding ambiguous chars like 0/O, 1/l/I)
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
  const randomBytes = crypto.randomBytes(length);
  let password = '';

  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }

  return password;
}

/**
 * Generate a username from email
 * Takes the part before @ and adds random suffix if needed
 */
export function generateUsernameFromEmail(email: string): string {
  const localPart = email.split('@')[0];
  // Clean up: only allow alphanumeric, dots, underscores, hyphens
  const cleaned = localPart.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
  return cleaned || 'user';
}

/**
 * Generate a unique username by adding a numeric suffix if needed
 */
export function generateUniqueUsername(
  baseUsername: string,
  existingUsernames: string[]
): string {
  if (!existingUsernames.includes(baseUsername)) {
    return baseUsername;
  }

  let suffix = 1;
  while (existingUsernames.includes(`${baseUsername}${suffix}`)) {
    suffix++;
  }

  return `${baseUsername}${suffix}`;
}
