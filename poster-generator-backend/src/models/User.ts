import bcrypt from 'bcryptjs';
import { model, Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export type UserRole = 'user' | 'admin';

export interface UserAttrs {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<UserAttrs, UserMethods>;
export type UserModel = Model<UserAttrs, {}, UserMethods>;

/**
 * Cost factor 12 is the current sensible default: roughly 250 ms per hash on
 * commodity hardware, which is expensive enough to make offline cracking
 * impractical while staying fast enough for an interactive login.
 */
const BCRYPT_ROUNDS = 12;

const userSchema = new Schema<UserAttrs, UserModel, UserMethods>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'] as const,
      default: 'user',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

userSchema.methods.comparePassword = function comparePassword(candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, BCRYPT_ROUNDS);

/** Shape returned to clients. Contains no secrets by construction. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
}

export function toPublicUser(user: { _id: Types.ObjectId | string; name: string; email: string; role: UserRole; createdAt: Date }): PublicUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export const User = model<UserAttrs, UserModel>('User', userSchema);
