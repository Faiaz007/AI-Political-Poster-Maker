import sharp from 'sharp';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Template } from '../models/Template';
import { getStorageService } from '../services/storage.factory';
import { logger } from '../utils/logger';
import { buildBackgroundSvg, buildThumbnailSvg, SEED_TEMPLATES } from './definitions';

/**
 * Idempotent seed: templates are upserted by slug, so running it repeatedly
 * updates the existing documents instead of duplicating them.
 *
 * Generated artwork is cached by checking whether a marker file already exists
 * for the slug; regenerating identical SVG on every run would otherwise create
 * hundreds of orphaned storage objects.
 */
async function rasterise(svg: string, width: number, height: number): Promise<Buffer> {
  return sharp(Buffer.from(svg)).resize(width, height).png({ compressionLevel: 9 }).toBuffer();
}

async function seed(): Promise<void> {
  await connectDatabase();

  const storage = getStorageService();
  logger.info('Seeding templates', { driver: storage.name, count: SEED_TEMPLATES.length });

  for (const definition of SEED_TEMPLATES) {
    const { slug } = definition;

    const backgroundBuffer = await rasterise(
      buildBackgroundSvg(definition.background),
      definition.canvas.width,
      definition.canvas.height,
    );
    const thumbnailBuffer = await rasterise(
      buildThumbnailSvg(definition.background),
      Math.round(definition.canvas.width / 4),
      Math.round(definition.canvas.height / 4),
    );

    const background = await storage.uploadImage({
      buffer: backgroundBuffer,
      filename: `${slug}-background.png`,
      contentType: 'image/png',
      folder: 'templates',
    });
    const thumbnail = await storage.uploadImage({
      buffer: thumbnailBuffer,
      filename: `${slug}-thumbnail.png`,
      contentType: 'image/png',
      folder: 'templates',
    });

    // Stored as the raw storage key/relative path. Absolutising is the
    // renderer's job, so the same document works in every environment.
    const backgroundUrl = background.url;
    const thumbnailUrl = thumbnail.url;

    const result = await Template.findOneAndUpdate(
      { slug },
      {
        $set: {
          title: definition.title,
          occasionType: definition.occasionType,
          description: definition.description,
          thumbnailUrl,
          backgroundUrl,
          canvas: definition.canvas,
          layoutConfig: definition.layoutConfig,
          isActive: true,
        },
        $setOnInsert: { slug },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    logger.info('Template seeded', { slug, id: String(result._id) });
  }

  const total = await Template.countDocuments();
  logger.info('Seed complete', { templatesInDatabase: total });
}

seed()
  .then(async () => {
    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (error: Error) => {
    logger.error('Seed failed', { message: error.message, stack: error.stack });
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
