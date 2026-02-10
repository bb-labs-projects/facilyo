import * as bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Bcrypt cost factor (10-12 is recommended for production)
const BCRYPT_ROUNDS = 12;

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
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
  const maxUnbiased = Math.floor(256 / charset.length) * charset.length;
  let password = '';

  while (password.length < length) {
    const randomBytes = crypto.randomBytes(length - password.length + 16);
    for (let i = 0; i < randomBytes.length && password.length < length; i++) {
      // Rejection sampling: discard bytes that would cause modulo bias
      if (randomBytes[i] < maxUnbiased) {
        password += charset[randomBytes[i] % charset.length];
      }
    }
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
