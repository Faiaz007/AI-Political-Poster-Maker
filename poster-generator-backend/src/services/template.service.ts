import { Types } from 'mongoose';
import { Template, toTemplateSummary, type TemplateSummary } from '../models/Template';
import type { OccasionType } from '../schemas/common.schema';
import { NotFoundError } from '../utils/errors';

export async function listTemplates(occasion?: OccasionType): Promise<TemplateSummary[]> {
  const filter = occasion ? { occasionType: occasion, isActive: true } : { isActive: true };

  const docs = await Template.find(filter).sort({ createdAt: 1 }).lean();

  return docs.map((doc) => toTemplateSummary(doc as never));
}

export async function getTemplateById(id: string): Promise<TemplateSummary> {
  if (!Types.ObjectId.isValid(id)) {
    throw new NotFoundError('Template not found');
  }

  const doc = await Template.findOne({ _id: id, isActive: true });
  if (!doc) {
    throw new NotFoundError('Template not found');
  }

  return toTemplateSummary(doc as never);
}

/**
 * Full document including layoutConfig, used by the renderer. Kept separate
 * from getTemplateById so the public endpoint never leaks internal defaults.
 */
export async function getTemplateDocument(id: string) {
  if (!Types.ObjectId.isValid(id)) {
    throw new NotFoundError('Template not found');
  }

  const doc = await Template.findOne({ _id: id, isActive: true });
  if (!doc) {
    throw new NotFoundError('Template not found');
  }

  return doc;
}

/**
 * Slug lookup for the generation pipeline. The poster request carries a slug
 * rather than an ObjectId so a stale client cannot reference a template that has
 * since been deactivated.
 */
export async function getTemplateDocumentBySlug(slug: string) {
  const doc = await Template.findOne({ slug: slug.toLowerCase(), isActive: true });
  if (!doc) {
    throw new NotFoundError('Template not found');
  }

  return doc;
}
