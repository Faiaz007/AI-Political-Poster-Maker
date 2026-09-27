import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { rendererService } from '../src/services/renderer.service';
import { buildPosterHtml } from '../src/renderers/html.builder';
import { getTemplateDocumentBySlug } from '../src/services/template.service';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { FALLBACK_LAYOUT, type GeminiLayout } from '../src/schemas/gemini.schema';

const OUT = path.resolve(__dirname, '../render-samples');

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await connectDatabase();

  // Real fixtures so the sample shows real photos, not placeholders.
  const photos = await Promise.all(
    [
      { bg: { r: 198, g: 40, b: 40 }, label: 'A' },
      { bg: { r: 30, g: 90, b: 160 }, label: 'B' },
      { bg: { r: 40, g: 130, b: 70 }, label: 'C' },
    ].map(async ({ bg, label }, index) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200">
        <rect width="900" height="1200" fill="rgb(${bg.r},${bg.g},${bg.b})"/>
        <circle cx="450" cy="480" r="260" fill="rgba(255,255,255,0.85)"/>
        <text x="450" y="1010" font-size="200" font-family="sans-serif" fill="#fff" text-anchor="middle">${label}</text>
      </svg>`;
      const file = path.join(OUT, `fixture-${index}.png`);
      await sharp(Buffer.from(svg)).png().toFile(file);
      return `file://${file}`;
    }),
  );

  const template = await getTemplateDocumentBySlug('victory-national');
  if (!template) throw new Error('Seed the database first: npm run seed');

  const variants: Array<{ name: string; layout: GeminiLayout }> = [
    { name: 'fallback', layout: FALLBACK_LAYOUT },
    {
      name: 'ai-tribute',
      layout: {
        layoutVariant: 'three_top',
        palette: { primary: '#12355b', secondary: '#7f8c8d', accent: '#e8dcc4' },
        photoLayout: 'three_top',
        headlineStyle: 'large_center',
        backgroundDecoration: ['soft_pattern', 'dove', 'floral_border'],
        headlineScale: 0.92,
        footerStyle: 'light_bar',
      },
    },
    {
      name: 'ai-campaign',
      layout: {
        layoutVariant: 'three_top',
        palette: { primary: '#0b6e4f', secondary: '#f42a41', accent: '#ffd54a' },
        photoLayout: 'three_top',
        headlineStyle: 'large_left',
        backgroundDecoration: ['national_color_accent', 'light_rays'],
        headlineScale: 1.15,
        footerStyle: 'dark_bar',
      },
    },
  ];

  for (const variant of variants) {
    const input = {
      canvas: template.canvas,
      layoutConfig: template.layoutConfig,
      layout: variant.layout,
      copy: {
        headline: 'মহান বিজয় দিবসের আনন্দে',
        subheadline: '১৬ ডিসেম্বর — জাতীয় পতাকা দিবস',
        name: 'নুরুল ইসলাম',
        designation: 'সভাপতি, গণপরিষদ',
        organization: 'জাতীয় সংগঠন কমিটি',
        location: 'ঢাকা',
        contact: 'মোবাইল: 01700-000000',
      },
      photoUrls: photos,
      backgroundUrl: null,
      fallbackPalette: { primary: '#006A4E', secondary: '#F42A41', accent: '#FFFFFF' },
    };

    const html = buildPosterHtml(input);
    writeFileSync(path.join(OUT, `${variant.name}.html`), html);

    const buffer = await rendererService.render(input);
    const file = path.join(OUT, `${variant.name}.png`);
    writeFileSync(file, buffer);

    const meta = await sharp(buffer).metadata();
    console.log(
      `${variant.name.padEnd(12)} -> ${file}  ${meta.width}x${meta.height}  ${(buffer.length / 1024).toFixed(0)} KB`,
    );
  }

  await rendererService.close();
  await disconnectDatabase();
}

main().catch(async (error) => {
  console.error('Render sample failed:', error);
  await rendererService.close().catch(() => undefined);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
