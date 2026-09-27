import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

mongoose.set('strictQuery', true);

mongoose.connection.on('connected', () => {
  logger.info('MongoDB connected', { host: mongoose.connection.host, db: mongoose.connection.name });
});

mongoose.connection.on('error', (error: Error) => {
  logger.error('MongoDB connection error', { message: error.message });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

export async function connectDatabase(): Promise<typeof mongoose> {
  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });

  logger.info('Database ready', { uri: redactUri(env.MONGODB_URI) });
  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.connection.close();
  logger.info('Database connection closed');
}

/** Strips credentials from a Mongo URI so it is safe to log. */
export function redactUri(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}
