import type { BackgroundOptions } from './artwork';
import { buildBackgroundSvg, buildThumbnailSvg } from './artwork';
import type { LayoutConfig, PhotoSlot, TextSlot } from '../models/Template';

export interface SeedTemplateDefinition {
  slug: string;
  title: string;
  occasionType: 'victory' | 'tribute' | 'campaign' | 'greeting' | 'festival';
  description: string;
  canvas: { width: number; height: number };
  background: BackgroundOptions;
  layoutConfig: LayoutConfig;
}

const CANVAS = { width: 1800, height: 2400 } as const;

/** Three circular portraits in a row across the top, headline beneath. */
const threePortraitSlots: PhotoSlot[] = [
  { id: 'photo-1', x: 0.07, y: 0.055, width: 0.27, height: 0.27, shape: 'circle', objectFit: 'cover', zIndex: 10, borderWidth: 10, borderColor: '#ffffff' },
  { id: 'photo-2', x: 0.365, y: 0.055, width: 0.27, height: 0.27, shape: 'circle', objectFit: 'cover', zIndex: 10, borderWidth: 10, borderColor: '#ffffff' },
  { id: 'photo-3', x: 0.66, y: 0.055, width: 0.27, height: 0.27, shape: 'circle', objectFit: 'cover', zIndex: 10, borderWidth: 10, borderColor: '#ffffff' },
];

/** One large centred portrait, suitable for a memorial or a single candidate. */
const centrePortraitSlots: PhotoSlot[] = [
  { id: 'photo-1', x: 0.24, y: 0.09, width: 0.52, height: 0.4, shape: 'rectangle', objectFit: 'cover', zIndex: 10, borderWidth: 12, borderColor: '#f5f5f5' },
];

/** Two portraits side by side, leaving a clear column for left-aligned text. */
const twoPortraitSlots: PhotoSlot[] = [
  { id: 'photo-1', x: 0.08, y: 0.07, width: 0.36, height: 0.36, shape: 'circle', objectFit: 'cover', zIndex: 10, borderWidth: 10, borderColor: '#ffffff' },
  { id: 'photo-2', x: 0.56, y: 0.07, width: 0.36, height: 0.36, shape: 'circle', objectFit: 'cover', zIndex: 10, borderWidth: 10, borderColor: '#ffffff' },
];

const victoryTextSlots: TextSlot[] = [
  { id: 'headline', type: 'headline', x: 0.07, y: 0.37, width: 0.86, height: 0.13, fontSize: 132, fontWeight: 800, align: 'center', color: '#ffffff', lineHeight: 1.15, letterSpacing: 0, scaleWithHeadline: true, zIndex: 20, textShadow: true },
  { id: 'subheadline', type: 'subheadline', x: 0.12, y: 0.51, width: 0.76, height: 0.08, fontSize: 62, fontWeight: 600, align: 'center', color: '#ffd54a', lineHeight: 1.3, letterSpacing: 0.01, scaleWithHeadline: true, zIndex: 20, textShadow: true },
  { id: 'name', type: 'name', x: 0.1, y: 0.64, width: 0.8, height: 0.07, fontSize: 78, fontWeight: 700, align: 'center', color: '#ffffff', lineHeight: 1.2, letterSpacing: 0, scaleWithHeadline: false, zIndex: 20, textShadow: true },
  { id: 'designation', type: 'designation', x: 0.1, y: 0.715, width: 0.8, height: 0.055, fontSize: 52, fontWeight: 600, align: 'center', color: '#f0f0f0', lineHeight: 1.3, letterSpacing: 0, scaleWithHeadline: false, zIndex: 20, textShadow: true },
  { id: 'location', type: 'location', x: 0.1, y: 0.775, width: 0.8, height: 0.05, fontSize: 42, fontWeight: 500, align: 'center', color: '#dcdcdc', lineHeight: 1.3, letterSpacing: 0, scaleWithHeadline: false, zIndex: 20, textShadow: true },
];

const tributeTextSlots: TextSlot[] = [
  { id: 'headline', type: 'headline', x: 0.1, y: 0.52, width: 0.8, height: 0.12, fontSize: 112, fontWeight: 700, align: 'center', color: '#1a1a1a', lineHeight: 1.2, letterSpacing: 0, scaleWithHeadline: true, zIndex: 20, textShadow: false },
  { id: 'subheadline', type: 'subheadline', x: 0.12, y: 0.65, width: 0.76, height: 0.08, fontSize: 54, fontWeight: 500, align: 'center', color: '#3d3d3d', lineHeight: 1.35, letterSpacing: 0, scaleWithHeadline: true, zIndex: 20, textShadow: false },
  { id: 'name', type: 'name', x: 0.1, y: 0.75, width: 0.8, height: 0.07, fontSize: 70, fontWeight: 700, align: 'center', color: '#222222', lineHeight: 1.2, letterSpacing: 0, scaleWithHeadline: false, zIndex: 20, textShadow: false },
  { id: 'designation', type: 'designation', x: 0.1, y: 0.825, width: 0.8, height: 0.055, fontSize: 48, fontWeight: 500, align: 'center', color: '#4a4a4a', lineHeight: 1.3, letterSpacing: 0, scaleWithHeadline: false, zIndex: 20, textShadow: false },
  { id: 'location', type: 'location', x: 0.1, y: 0.885, width: 0.8, height: 0.05, fontSize: 40, fontWeight: 400, align: 'center', color: '#5f5f5f', lineHeight: 1.3, letterSpacing: 0, scaleWithHeadline: false, zIndex: 20, textShadow: false },
];

const campaignTextSlots: TextSlot[] = [
  { id: 'headline', type: 'headline', x: 0.08, y: 0.47, width: 0.84, height: 0.15, fontSize: 118, fontWeight: 800, align: 'left', color: '#ffffff', lineHeight: 1.15, letterSpacing: 0, scaleWithHeadline: true, zIndex: 20, textShadow: true },
  { id: 'subheadline', type: 'subheadline', x: 0.08, y: 0.635, width: 0.84, height: 0.08, fontSize: 56, fontWeight: 600, align: 'left', color: '#ffe082', lineHeight: 1.3, letterSpacing: 0, scaleWithHeadline: true, zIndex: 20, textShadow: true },
  { id: 'name', type: 'name', x: 0.08, y: 0.75, width: 0.84, height: 0.07, fontSize: 76, fontWeight: 700, align: 'left', color: '#ffffff', lineHeight: 1.2, letterSpacing: 0, scaleWithHeadline: false, zIndex: 20, textShadow: true },
  { id: 'designation', type: 'designation', x: 0.08, y: 0.825, width: 0.84, height: 0.055, fontSize: 50, fontWeight: 600, align: 'left', color: '#eeeeee', lineHeight: 1.3, letterSpacing: 0, scaleWithHeadline: false, zIndex: 20, textShadow: true },
  { id: 'location', type: 'location', x: 0.08, y: 0.885, width: 0.84, height: 0.05, fontSize: 40, fontWeight: 500, align: 'left', color: '#dddddd', lineHeight: 1.3, letterSpacing: 0, scaleWithHeadline: false, zIndex: 20, textShadow: true },
];

const footer = (backgroundColor: string, textColor = '#ffffff') => ({
  enabled: true,
  height: 0.075,
  backgroundColor,
  textColor,
  prefix: 'প্রচারে: ',
});

export const SEED_TEMPLATES: SeedTemplateDefinition[] = [
  {
    slug: 'victory-national',
    title: 'মহান বিজয় দিবস',
    occasionType: 'victory',
    description: 'National victory day layout with three leader portraits and a bold centred headline.',
    canvas: CANVAS,
    background: {
      width: CANVAS.width,
      height: CANVAS.height,
      gradient: ['#0b6b4f', '#04402f'],
      accent: '#ffd54a',
      motifs: 'floral',
      vignette: true,
    },
    layoutConfig: {
      photoSlots: threePortraitSlots,
      textSlots: victoryTextSlots,
      decoration: { allowed: ['gradient', 'floral_border', 'dove', 'light_rays', 'national_color_accent'] },
      footer: footer('#006A4E'),
    },
  },
  {
    slug: 'tribute-condolence',
    title: 'শোক ও স্মরণ',
    occasionType: 'tribute',
    description: 'Solemn tribute layout with a single centred portrait and restrained typography.',
    canvas: CANVAS,
    background: {
      width: CANVAS.width,
      height: CANVAS.height,
      gradient: ['#f4f1ea', '#d9d3c6'],
      accent: '#4a4a4a',
      motifs: 'dove',
      vignette: false,
    },
    layoutConfig: {
      photoSlots: centrePortraitSlots,
      textSlots: tributeTextSlots,
      decoration: { allowed: ['floral_border', 'soft_pattern', 'dove', 'gradient'] },
      footer: footer('#1f1f1f'),
    },
  },
  {
    slug: 'general-campaign',
    title: 'নির্বাচনী প্রচার',
    occasionType: 'campaign',
    description: 'Campaign layout with two portraits and left-aligned text for longer headlines.',
    canvas: CANVAS,
    background: {
      width: CANVAS.width,
      height: CANVAS.height,
      gradient: ['#c1121f', '#7a0c14'],
      accent: '#ffffff',
      motifs: 'rays',
      vignette: true,
    },
    layoutConfig: {
      photoSlots: twoPortraitSlots,
      textSlots: campaignTextSlots,
      decoration: { allowed: ['gradient', 'light_rays', 'national_color_accent', 'soft_pattern'] },
      footer: footer('#0b6b4f'),
    },
  },
];

export { buildBackgroundSvg, buildThumbnailSvg };
