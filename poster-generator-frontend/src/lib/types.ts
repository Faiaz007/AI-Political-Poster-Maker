/** Shapes returned by the Express API. Kept in sync with docs/API_DESIGN.md. */

export type OccasionType = 'victory' | 'tribute' | 'campaign' | 'greeting' | 'festival';

export type PosterStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: string;
}

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

export interface PosterCopy {
  headline: string;
  subheadline?: string;
  name?: string;
  designation?: string;
  organization?: string;
  location?: string;
  contact?: string;
}

export interface PosterSummary {
  id: string;
  templateSlug: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface UploadedPhoto {
  url: string;
  publicId: string;
  width: number;
  height: number;
  bytes: number;
}

export interface Paginated<T> {
  page: number;
  total: number;
  totalPages: number;
  items: T[];
}

export interface PaginatedPosters extends Paginated<PosterSummary> {
  posters: PosterSummary[];
}
