import bcrypt from 'bcrypt';
import { db } from './db';
import { users, type User } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from './logger';
import { passwordState, verifiableHashOf } from './trader-accounts';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Checks a password against users.password_hash. Understands the trader-account
 * states (server/trader-accounts.ts): 'mustchange$<bcrypt>' verifies against its
 * bcrypt part; 'pending$…' (no password set yet) and anything else non-bcrypt
 * never verifies.
 */
export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  const real = verifiableHashOf(hash);
  if (!real) return false;
  return bcrypt.compare(password, real);
}

/** Spent on unknown accounts too, so response time does not say whether an account exists. */
let timingDummyHash: Promise<string> | null = null;
const timingDummy = () => (timingDummyHash ??= bcrypt.hash('timing-dummy', BCRYPT_ROUNDS));

export async function getUserByEmail(email: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user || null;
}

export async function createUser(
  email: string,
  password: string,
  firstName?: string,
  lastName?: string
): Promise<Omit<User, 'passwordHash'> | null> {
  try {
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return null;
    }

    const passwordHash = await hashPassword(password);
    
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        subscriptionTier: 'free',
        subscriptionStatus: 'active',
      })
      .returning();

    logger.info('User created successfully', { userId: newUser.id, email });

    const { passwordHash: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword as Omit<User, 'passwordHash'>;
  } catch (error) {
    logger.error('Error creating user', { error, email });
    throw error;
  }
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<(Omit<User, 'passwordHash'> & { mustChangePassword: boolean }) | null> {
  try {
    const user = await getUserByEmail(email);
    if (!user || !verifiableHashOf(user.passwordHash)) {
      await timingDummy().then((h) => bcrypt.compare(password, h)).catch(() => false);
      return null;
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return null;
    }

    logger.info('User authenticated successfully', { userId: user.id, email });

    const mustChangePassword = passwordState(user.passwordHash) === 'must_change';
    const { passwordHash: _, ...userWithoutPassword } = user;
    return { ...(userWithoutPassword as Omit<User, 'passwordHash'>), mustChangePassword };
  } catch (error) {
    logger.error('Error authenticating user', { error, email });
    return null;
  }
}

// Owner email - the only account with admin access (set via ADMIN_EMAIL env var)
export function getOwnerEmail(): string {
  return process.env.ADMIN_EMAIL || "";
}

export function sanitizeUser(user: User): Omit<User, 'passwordHash'> & { isAdmin: boolean } {
  const { passwordHash: _, ...sanitized } = user;
  const ownerEmail = getOwnerEmail();
  // Case-insensitive admin check to handle mixed-case emails
  const isAdmin = ownerEmail !== "" && 
    user.email?.toLowerCase() === ownerEmail.toLowerCase();
  return {
    ...sanitized,
    isAdmin,
  } as Omit<User, 'passwordHash'> & { isAdmin: boolean };
}
