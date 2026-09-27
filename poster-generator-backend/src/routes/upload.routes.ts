import { Router } from 'express';
import { uploadPhotosHandler } from '../controllers/upload.controller';
import { authenticate } from '../middleware/auth';
import { uploadLimiter } from '../middleware/rateLimiter';
import { uploadPhotos } from '../middleware/upload';

const router = Router();

router.post(
  '/',
  authenticate,
  uploadLimiter,
  uploadPhotos,
  uploadPhotosHandler,
);

export default router;
