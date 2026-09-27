import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { getTemplateById, listTemplates } from '../services/template.service';
import type { OccasionType } from '../schemas/common.schema';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const occasion = req.query.occasion as OccasionType | undefined;
  const templates = await listTemplates(occasion);
  res.status(200).json({ success: true, data: { templates } });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const template = await getTemplateById(req.params.id);
  res.status(200).json({ success: true, data: { template } });
});
