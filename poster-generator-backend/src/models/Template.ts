import { model, Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import { OCCASIONS, type OccasionType } from '../schemas/common.schema';

export type PhotoSlotShape = 'rectangle' | 'circle';
export type ObjectFitMode = 'cover' | 'contain';
export type TextSlotType = 'headline' | 'subheadline' | 'name' | 'designation' | 'location' | 'footer';
export type TextAlign = 'left' | 'center' | 'right';

/**
 * All geometry is normalised to 0..1 relative to the canvas. A template is
 * therefore resolution-independent: the identical config renders at
 * 1200x1600, 1800x2400 or any other size by multiplying at render time.
 */
export interface PhotoSlot {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: PhotoSlotShape;
  objectFit: ObjectFitMode;
  zIndex: number;
  borderWidth: number;
  borderColor: string;
}

export interface TextSlot {
  id: string;
  type: TextSlotType;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: number;
  align: TextAlign;
  color: string;
  lineHeight: number;
  letterSpacing: number;
  /** Multiplier applied on top of fontSize, driven by the AI headlineScale. */
  scaleWithHeadline: boolean;
  zIndex: number;
  textShadow: boolean;
}

export interface FooterConfig {
  enabled: boolean;
  height: number;
  backgroundColor: string;
  textColor: string;
  prefix: string;
}

export interface LayoutConfig {
  photoSlots: PhotoSlot[];
  textSlots: TextSlot[];
  /** Decorations this template permits. Gemini may only pick from this list. */
  decoration: { allowed: string[] };
  footer: FooterConfig;
}

export interface TemplateAttrs {
  title: string;
  slug: string;
  occasionType: OccasionType;
  description: string;
  thumbnailUrl: string;
  backgroundUrl: string;
  canvas: { width: number; height: number };
  layoutConfig: LayoutConfig;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type TemplateDocument = HydratedDocument<TemplateAttrs>;
export type TemplateModel = Model<TemplateAttrs>;

const normalizedNumber = { type: Number, required: true, min: 0, max: 1 } as const;
const hexColor = {
  type: String,
  required: true,
  match: [/^#[0-9a-fA-F]{3,8}$/, 'Invalid hex colour'] as [RegExp, string],
} as const;

const photoSlotSchema = new Schema<PhotoSlot>(
  {
    id: { type: String, required: true },
    x: normalizedNumber,
    y: normalizedNumber,
    width: normalizedNumber,
    height: normalizedNumber,
    shape: { type: String, enum: ['rectangle', 'circle'], default: 'rectangle' },
    objectFit: { type: String, enum: ['cover', 'contain'], default: 'cover' },
    zIndex: { type: Number, default: 10 },
    borderWidth: { type: Number, default: 0, min: 0 },
    borderColor: { type: String, default: '#ffffff' },
  },
  { _id: false },
);

const textSlotSchema = new Schema<TextSlot>(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ['headline', 'subheadline', 'name', 'designation', 'location', 'footer'],
      required: true,
    },
    x: normalizedNumber,
    y: normalizedNumber,
    width: normalizedNumber,
    height: normalizedNumber,
    fontSize: { type: Number, required: true, min: 8, max: 400 },
    fontWeight: { type: Number, required: true, min: 100, max: 900 },
    align: { type: String, enum: ['left', 'center', 'right'], default: 'center' },
    color: hexColor,
    lineHeight: { type: Number, default: 1.25, min: 0.8, max: 3 },
    letterSpacing: { type: Number, default: 0, min: -0.1, max: 1 },
    scaleWithHeadline: { type: Boolean, default: false },
    zIndex: { type: Number, default: 20 },
    textShadow: { type: Boolean, default: false },
  },
  { _id: false },
);

const templateSchema = new Schema<TemplateAttrs, TemplateModel>(
  {
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes'],
    },
    occasionType: { type: String, enum: OCCASIONS, required: true },
    description: { type: String, default: '', maxlength: 300 },
    thumbnailUrl: { type: String, required: true },
    backgroundUrl: { type: String, required: true },
    canvas: {
      width: { type: Number, required: true, min: 600, max: 6000 },
      height: { type: Number, required: true, min: 600, max: 6000 },
    },
    layoutConfig: {
      photoSlots: { type: [photoSlotSchema], default: [] },
      textSlots: { type: [textSlotSchema], default: [] },
      decoration: {
        allowed: { type: [String], default: [] },
      },
      footer: {
        enabled: { type: Boolean, default: true },
        height: normalizedNumber,
        backgroundColor: hexColor,
        textColor: hexColor,
        prefix: { type: String, default: 'প্রচারে: ' },
      },
    },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true, versionKey: false },
  },
);

templateSchema.index({ occasionType: 1, isActive: 1 });
templateSchema.index({ createdAt: -1 });

/** Lightweight projection for the template gallery — omits the full layout. */
export interface TemplateSummary {
  id: string;
  title: string;
  slug: string;
  occasionType: OccasionType;
  description: string;
  thumbnailUrl: string;
  backgroundUrl: string;
  canvas: { width: number; height: number };
  photoSlotCount: number;
  isActive: boolean;
}

export function toTemplateSummary(doc: {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  occasionType: OccasionType;
  description: string;
  thumbnailUrl: string;
  backgroundUrl: string;
  canvas: { width: number; height: number };
  layoutConfig: { photoSlots: unknown[] };
  isActive: boolean;
}): TemplateSummary {
  return {
    id: String(doc._id),
    title: doc.title,
    slug: doc.slug,
    occasionType: doc.occasionType,
    description: doc.description,
    thumbnailUrl: doc.thumbnailUrl,
    backgroundUrl: doc.backgroundUrl,
    canvas: doc.canvas,
    photoSlotCount: doc.layoutConfig.photoSlots.length,
    isActive: doc.isActive,
  };
}

export const Template = model<TemplateAttrs, TemplateModel>('Template', templateSchema);
