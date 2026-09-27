import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { loginUser, registerUser, type LoginInput, type RegisterInput } from '../services/auth.service';

/**
 * Controllers stay thin: the Zod middleware has already validated and coerced
 * the body, so all this layer does is call the service and shape the response.
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await registerUser(req.body as RegisterInput);
  res.status(201).json({ success: true, data: result });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await loginUser(req.body as LoginInput);
  res.status(200).json({ success: true, data: result });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const { id, role } = req.user!;
  res.status(200).json({ success: true, data: { user: { id, role } } });
});
