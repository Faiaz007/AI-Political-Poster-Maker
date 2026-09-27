import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { toPosterSummary } from '../models/Poster';
import {
  createPoster,
  deletePoster,
  getUserPoster,
  listUserPosters,
  regeneratePoster,
} from '../services/poster.service';
import type { CreatePosterInput, ListPostersInput } from '../schemas/poster.schema';

export const createPosterHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as CreatePosterInput;

  const poster = await createPoster({
    userId: req.user!.id,
    templateSlug: input.templateSlug,
    copy: input.copy,
    photoPublicIds: input.photoPublicIds,
  });

  // 202: accepted for processing. Rendering happens in the background and the
  // client polls the poster record for the finished URL.
  res.status(202).json({ success: true, data: { poster: toPosterSummary(poster.toObject() as never) } });
});

export const getPosterHandler = asyncHandler(async (req: Request, res: Response) => {
  const poster = await getUserPoster(req.params.id, req.user!.id);
  res.json({ success: true, data: { poster: toPosterSummary(poster.toObject() as never) } });
});

export const listPostersHandler = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = req.query as unknown as ListPostersInput;
  const result = await listUserPosters(req.user!.id, { page, limit });
  res.json({ success: true, data: result });
});

export const regeneratePosterHandler = asyncHandler(async (req: Request, res: Response) => {
  const poster = await regeneratePoster(req.params.id, req.user!.id);
  res.status(202).json({ success: true, data: { poster: toPosterSummary(poster.toObject() as never) } });
});

export const deletePosterHandler = asyncHandler(async (req: Request, res: Response) => {
  await deletePoster(req.params.id, req.user!.id);
  res.status(204).send();
});
