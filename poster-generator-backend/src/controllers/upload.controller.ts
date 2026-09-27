import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { storeUploadedPhotos } from '../services/upload.service';

/**
 * Auth is guaranteed by the router; the userId comes from the verified token,
 * never from the multipart body.
 */
export const uploadPhotosHandler = asyncHandler(async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const photos = await storeUploadedPhotos(files, req.user!.id);

  res.status(201).json({ success: true, data: { photos } });
});
