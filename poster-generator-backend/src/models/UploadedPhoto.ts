import { model, Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface UploadedPhotoAttrs {
  userId: Types.ObjectId;
  publicId: string;
  url: string;
  /** Dimensions of the stored (normalised) file, not the originally uploaded one. */
  width: number;
  height: number;
  bytes: number;
  contentType: string;
  createdAt: Date;
  updatedAt: Date;
}

export type UploadedPhotoDocument = HydratedDocument<UploadedPhotoAttrs>;
export type UploadedPhotoModel = Model<UploadedPhotoAttrs>;

/**
 * A record of every photo a user has uploaded.
 *
 * This exists so that poster generation can verify ownership from the database
 * rather than by inspecting a storage key's path prefix. A prefix check looks
 * reasonable but is not an authorisation control: it depends on a naming
 * convention that any future refactor could quietly break.
 */
const uploadedPhotoSchema = new Schema<UploadedPhotoAttrs, UploadedPhotoModel>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    publicId: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
    bytes: { type: Number, required: true, min: 1 },
    contentType: { type: String, required: true },
  },
  { timestamps: true },
);

uploadedPhotoSchema.index({ userId: 1, createdAt: -1 });

export const UploadedPhoto = model<UploadedPhotoAttrs, UploadedPhotoModel>('UploadedPhoto', uploadedPhotoSchema);
