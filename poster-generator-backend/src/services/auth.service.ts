import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthenticationError, ConflictError } from '../utils/errors';
import { User, hashPassword, toPublicUser, type PublicUser, type UserRole } from '../models/User';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: PublicUser;
  token: string;
}

export interface TokenPayload {
  sub: string;
  role: UserRole;
}

export async function registerUser({ name, email, password }: RegisterInput): Promise<AuthResult> {
  const normalisedEmail = email.toLowerCase().trim();

  const existing = await User.exists({ email: normalisedEmail });
  if (existing) {
    throw new ConflictError('An account with that email already exists');
  }

  const passwordHash = await hashPassword(password);

  const user = await User.create({ name, email: normalisedEmail, passwordHash });

  return { user: toPublicUser(user), token: signToken({ sub: String(user._id), role: user.role }) };
}

export async function loginUser({ email, password }: LoginInput): Promise<AuthResult> {
  const normalisedEmail = email.toLowerCase().trim();

  // The hash is selected explicitly because `passwordHash` is `select: false`.
  const user = await User.findOne({ email: normalisedEmail }).select('+passwordHash');

  // Compare against a dummy hash when the user does not exist so that the
  // response time does not reveal whether an email is registered.
  if (!user) {
    await hashPassword(password);
    throw new AuthenticationError('Invalid email or password');
  }

  const matches = await user.comparePassword(password);
  if (!matches) {
    throw new AuthenticationError('Invalid email or password');
  }

  return { user: toPublicUser(user), token: signToken({ sub: String(user._id), role: user.role }) };
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as SignOptions);
}

export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
      throw new AuthenticationError('Invalid session token');
    }
    return { sub: decoded.sub, role: (decoded as { role?: UserRole }).role ?? 'user' };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    throw new AuthenticationError('Invalid or expired session');
  }
}
