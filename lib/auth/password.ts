import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/**
 * A precomputed hash with no corresponding real password. Compare against
 * this when a user isn't found, so a login attempt for a nonexistent email
 * takes the same time as one for a real email (avoids timing-based email
 * enumeration in the credentials authorize callback).
 */
export const DUMMY_PASSWORD_HASH =
  "$2b$12$uMMqu5SSqfCZlX9Lz/8h3ev8r9VqMAnbcZ5I828rxl8u94uAfs75.";

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
