import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { generationLimiter } from '../middleware/rateLimiter';
import {
  createPosterSchema,
  listPostersSchema,
  regeneratePosterSchema,
} from '../schemas/poster.schema';
import {
  createPosterHandler,
  deletePosterHandler,
  getPosterHandler,
  listPostersHandler,
  regeneratePosterHandler,
} from '../controllers/poster.controller';

const router = Router();

// Every poster route is scoped to the authenticated owner. Ownership is never
// taken from the request body or from a userId path parameter.
router.use(authenticate);

router.post(
  '/',
  generationLimiter,
  validate(createPosterSchema, ['body']),
  createPosterHandler,
);

router.get('/', validate(listPostersSchema, ['query']), listPostersHandler);

router.get('/:id', getPosterHandler);

router.post(
  '/:id/regenerate',
  generationLimiter,
  validate(regeneratePosterSchema, ['body']),
  regeneratePosterHandler,
);

router.delete('/:id', deletePosterHandler);

export default router;
