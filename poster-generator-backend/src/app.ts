import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { globalLimiter } from './middleware/rateLimiter';
import { requestId } from './middleware/requestId';
import authRoutes from './routes/auth.routes';
import templateRoutes from './routes/template.routes';
import uploadRoutes from './routes/upload.routes';
import posterRoutes from './routes/poster.routes';

export function createApp(): Application {
  const app = express();

  // Behind a load balancer in production; required for correct client IPs in
  // the rate limiter and for HTTPS detection in secure cookies.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API only ever returns JSON, so a restrictive CSP costs nothing.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
      maxAge: 86400,
    }),
  );

  app.use(requestId);

  // Multer handles multipart bodies itself; the JSON parser must skip them or
  // the stream is consumed before multer ever sees it.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(globalLimiter);

  app.get('/health', (_req, res) => {
    res.json({
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        environment: env.NODE_ENV,
      },
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/templates', templateRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/posters', posterRoutes);
  app.use('/uploads', express.static(env.LOCAL_STORAGE_DIR, { maxAge: '7d', index: false }));

  // API routes are registered by the caller in later phases.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
