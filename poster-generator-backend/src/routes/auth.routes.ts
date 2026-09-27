import { Router } from 'express';
import { login, me, register } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validation';
import { loginSchema, registerSchema } from '../schemas/common.schema';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema, ['body']), register);
router.post('/login', authLimiter, validate(loginSchema, ['body']), login);
router.get('/me', authenticate, me);

export default router;
