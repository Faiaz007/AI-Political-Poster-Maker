import { model, Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import type { GeminiLayout } from '../schemas/gemini.schema';

export type PosterStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * The poster's copy is stored once, verbatim, at generation time.
 *
 * This is the single most important field in the model: the renderer reads these
 * strings and nothing else. Gemini never sees or writes them, so a design
 * regeneration can never alter, translate or paraphrase what the user typed.
 */
export interface PosterCopy {
  headline: string;
  subheadline?: string;
  name?: string;
  designation?: string;
  organization?: string;
  location?: string;
  contact?: string;
}

export interface PosterPhotoRef {
  /** Storage publicId, used to delete the asset. */
  publicId: string;
  url: string;
  width: number;
  height: number;
}

export interface PosterAttrs {
  userId: Types.ObjectId;
  templateId: Types.ObjectId;
  templateSlug: string;
  status: PosterStatus;
  copy: PosterCopy;
  photos: PosterPhotoRef[];
  /** Slug-level copy so history stays readable if a template is renamed. */
  occasionType: string;
  /** The AI's visual decision, stored for regeneration and debugging. */
  aiLayout: GeminiLayout | null;
  aiSource: 'gemini' | 'fallback' | null;
  outputUrl: string | null;
  outputPublicId: string | null;
  width: number;
  height: number;
  generationMs: number | null;
  errorMessage: string | null;
  /** Incremented on every regenerate; the previous PNG is retained. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type PosterDocument = HydratedDocument<PosterAttrs>;
export type PosterModel = Model<PosterAttrs>;

const photoRefSchema = new Schema<PosterPhotoRef>(
  {
    publicId: { type: String, required: true },
    url: { type: String, required: true },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const copySchema = new Schema<PosterCopy>(
  {
    headline: { type: String, required: [true, 'Headline is required'], trim: true, maxlength: 120 },
    subheadline: { type: String, trim: true, maxlength: 180 },
    name: { type: String, trim: true, maxlength: 80 },
    designation: { type: String, trim: true, maxlength: 100 },
    organization: { type: String, trim: true, maxlength: 120 },
    location: { type: String, trim: true, maxlength: 120 },
    contact: { type: String, trim: true, maxlength: 60 },
  },
  { _id: false },
);

const posterSchema = new Schema<PosterAttrs, PosterModel>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    templateId: { type: Schema.Types.ObjectId, ref: 'Template', required: true },
    templateSlug: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    copy: { type: copySchema, required: true },
    photos: { type: [photoRefSchema], default: [] },
    occasionType: { type: String, required: true, index: true },
    aiLayout: { type: Schema.Types.Mixed, default: null },
    aiSource: { type: String, enum: ['gemini', 'fallback', null], default: null },
    outputUrl: { type: String, default: null },
    outputPublicId: { type: String, default: null },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    generationMs: { type: Number, default: null },
    // Stored for operator visibility only; never returned to the client.
    errorMessage: { type: String, default: null, select: false },
    version: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true },
);

// History lists are always "most recent first, for this user, not failed".
posterSchema.index({ userId: 1, createdAt: -1 });
posterSchema.index({ userId: 1, status: 1, createdAt: -1 });

export interface PosterSummary {
  id: string;
  templateSlug: string;
  templateTitle?: string;
  occasionType: string;
  status: PosterStatus;
  headline: string;
  subheadline?: string;
  name?: string;
  organization?: string;
  location?: string;
  photoUrls: string[];
  outputUrl: string | null;
  width: number;
  height: number;
  aiSource: 'gemini' | 'fallback' | null;
  generationMs: number | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toPosterSummary(doc: {
  _id: Types.ObjectId;
  templateSlug: string;
  occasionType: string;
  status: PosterStatus;
  copy: PosterCopy;
  photos: PosterPhotoRef[];
  outputUrl: string | null;
  width: number;
  height: number;
  aiSource: 'gemini' | 'fallback' | null;
  generationMs: number | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): PosterSummary {
  return {
    id: String(doc._id),
    templateSlug: doc.templateSlug,
    occasionType: doc.occasionType,
    status: doc.status,
    headline: doc.copy.headline,
    subheadline: doc.copy.subheadline,
    name: doc.copy.name,
    organization: doc.copy.organization,
    location: doc.copy.location,
    photoUrls: doc.photos.map((photo) => photo.url),
    outputUrl: doc.outputUrl,
    width: doc.width,
    height: doc.height,
    aiSource: doc.aiSource,
    generationMs: doc.generationMs,
    version: doc.version,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const Poster = model<PosterAttrs, PosterModel>('Poster', posterSchema);
