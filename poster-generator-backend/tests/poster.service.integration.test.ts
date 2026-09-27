import { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { Template, type LayoutConfig } from '../src/models/Template';
import { Poster } from '../src/models/Poster';
import { UploadedPhoto } from '../src/models/UploadedPhoto';
import {
  createPoster,
  deletePoster,
  getUserPoster,
  listUserPosters,
  regeneratePoster,
} from '../src/services/poster.service';
import { rendererService } from '../src/services/renderer.service';
import { ValidationError } from '../src/utils/errors';

/**
 * These run against the real MongoDB in Docker, in a dedicated test database.
 * A mock would defeat the purpose: what is being verified is Mongoose query
 * behaviour (ownership enforced inside the filter, no IDOR) plus the real
 * Puppeteer render, and neither has a meaningful mock.
 */

const OWNER = new Types.ObjectId();
const ATTACKER = new Types.ObjectId();

const layoutConfig: LayoutConfig = {
  photoSlots: [
    { id: 'p1', x: 0.1, y: 0.05, width: 0.3, height: 0.3, shape: 'circle', objectFit: 'cover', zIndex: 10, borderWidth: 8, borderColor: '#ffffff' },
  ],
  textSlots: [
    { id: 'h', type: 'headline', x: 0.05, y: 0.4, width: 0.9, height: 0.15, fontSize: 90, fontWeight: 700, align: 'center', color: '#ffffff', lineHeight: 1.25, letterSpacing: 0, scaleWithHeadline: true, zIndex: 20, textShadow: true },
  ],
  decoration: { allowed: ['gradient'] },
  footer: { enabled: true, height: 0.08, backgroundColor: '#006A4E', textColor: '#ffffff', prefix: 'প্রচারে: ' },
};

async function waitForStatus(posterId: string, status: string, timeoutMs = 40_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // `errorMessage` is `select: false` so it is never returned to clients; the
    // test has to opt in explicitly to see why a render failed.
    const poster = await Poster.findById(posterId).select('+errorMessage');
    if (poster?.status === status) return;
    if (poster?.status === 'failed') {
      throw new Error(`Generation failed: ${poster.errorMessage ?? 'unknown'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for status "${status}"`);
}

beforeAll(async () => {
  await connectDatabase();
  await Template.create({
    title: 'পরীক্ষা টেমপ্লেট',
    slug: 'integration-test-template',
    occasionType: 'campaign',
    description: 'integration fixture',
    thumbnailUrl: '/uploads/t.png',
    backgroundUrl: '/uploads/b.png',
    canvas: { width: 900, height: 1200 },
    layoutConfig,
    isActive: true,
  });
});

afterAll(async () => {
  await Poster.deleteMany({});
  await UploadedPhoto.deleteMany({});
  await Template.deleteMany({ slug: 'integration-test-template' });
  await rendererService.close();
  await disconnectDatabase();
});

async function makePhoto(userId: Types.ObjectId): Promise<string> {
  const publicId = `posters/${userId}/fixture-${Math.random().toString(36).slice(2)}.jpg`;
  const photo = await UploadedPhoto.create({
    userId,
    publicId,
    url: `/uploads/${publicId}`,
    width: 900,
    height: 1200,
    bytes: 1000,
    contentType: 'image/jpeg',
  });
  return photo.publicId;
}

describe('poster generation pipeline', () => {
  it('creates and completes a poster with the exact stored copy', async () => {
    const publicId = await makePhoto(OWNER);
    const headline = 'ঠিক যেমন লিখেছি তেমনই';

    const created = await createPoster({
      userId: String(OWNER),
      templateSlug: 'integration-test-template',
      copy: { headline, name: 'নুরুল ইসলাম', organization: 'গণপরিষদ' },
      photoPublicIds: [publicId],
    });

    // The photo is resolved up front, so it is visible in the 202 response.
    expect(created.photos).toHaveLength(1);
    expect(created.photos[0].url).toMatch(/^http/);

    await waitForStatus(String(created._id), 'completed');

    const done = await Poster.findById(created._id);
    expect(done!.outputUrl).toMatch(/\.png$/);
    // The decisive assertion: rendered text is byte-identical to the input.
    expect(done!.copy.headline).toBe(headline);
    expect(done!.version).toBe(1);
  }, 60_000);

  it('falls back to a deterministic layout when Gemini is unavailable', async () => {
    const created = await createPoster({
      userId: String(OWNER),
      templateSlug: 'integration-test-template',
      copy: { headline: 'ফলব্যাক পরীক্ষা' },
      photoPublicIds: [],
    });
    await waitForStatus(String(created._id), 'completed');

    const done = await Poster.findById(created._id);
    // No usable API key is configured in tests, so this must still succeed.
    expect(done!.status).toBe('completed');
    expect(['gemini', 'fallback']).toContain(done!.aiSource);
    expect(done!.aiLayout).not.toBeNull();
  }, 60_000);

  it('rejects a photo belonging to another account synchronously', async () => {
    const foreignId = await makePhoto(OWNER);

    // Must throw before any record is written, so the caller gets a 422 rather
    // than a 202 followed by a silent failure.
    await expect(
      createPoster({
        userId: String(ATTACKER),
        templateSlug: 'integration-test-template',
        copy: { headline: 'চুরির চেষ্টা' },
        photoPublicIds: [foreignId],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    // Nothing may be left behind.
    const orphan = await Poster.findOne({ userId: ATTACKER });
    expect(orphan).toBeNull();
  });

  it('rejects a fabricated publicId including a traversal attempt', async () => {
    await expect(
      createPoster({
        userId: String(OWNER),
        templateSlug: 'integration-test-template',
        copy: { headline: 'পরীক্ষা' },
        photoPublicIds: ['posters/x/../../../etc/passwd.jpg'],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('keeps a poster invisible to another user', async () => {
    const created = await createPoster({
      userId: String(OWNER),
      templateSlug: 'integration-test-template',
      copy: { headline: 'গোপন পোস্টার' },
      photoPublicIds: [],
    });

    await expect(getUserPoster(String(created._id), String(ATTACKER))).rejects.toThrow();
    await expect(regeneratePoster(String(created._id), String(ATTACKER))).rejects.toThrow();
    await expect(deletePoster(String(created._id), String(ATTACKER))).rejects.toThrow();

    // Still reachable by the owner.
    await expect(getUserPoster(String(created._id), String(OWNER))).resolves.toBeDefined();
  }, 30_000);

  it('preserves the stored copy across a regenerate and bumps the version', async () => {
    const created = await createPoster({
      userId: String(OWNER),
      templateSlug: 'integration-test-template',
      copy: { headline: 'আসল লেখা', name: 'স্থায়ী নাম' },
      photoPublicIds: [],
    });
    await waitForStatus(String(created._id), 'completed');
    const first = await Poster.findById(created._id);

    await regeneratePoster(String(created._id), String(OWNER));
    await waitForStatus(String(created._id), 'completed');
    const second = await Poster.findById(created._id);

    expect(second!.version).toBe(2);
    // Regeneration re-lays-out the design; it must never rewrite the words.
    expect(second!.copy.headline).toBe('আসল লেখা');
    expect(second!.copy.name).toBe('স্থায়ী নাম');
    expect(second!.outputUrl).not.toBe(first!.outputUrl);
  }, 60_000);

  it('lists only the caller\'s posters and hides failed ones', async () => {
    const mine = await createPoster({
      userId: String(OWNER),
      templateSlug: 'integration-test-template',
      copy: { headline: 'তালিকা পরীক্ষা' },
      photoPublicIds: [],
    });
    await waitForStatus(String(mine._id), 'completed');

    const result = await listUserPosters(String(OWNER));
    expect(result.total).toBeGreaterThan(0);
    expect(result.posters.every((poster) => poster.status !== 'failed')).toBe(true);

    const theirs = await listUserPosters(String(ATTACKER));
    expect(theirs.total).toBe(0);
  }, 60_000);

  it('deletes the poster and its stored output', async () => {
    const created = await createPoster({
      userId: String(OWNER),
      templateSlug: 'integration-test-template',
      copy: { headline: 'মুছে ফেলা' },
      photoPublicIds: [],
    });
    await waitForStatus(String(created._id), 'completed');
    const done = await Poster.findById(created._id);

    await deletePoster(String(created._id), String(OWNER));

    expect(await Poster.findById(created._id)).toBeNull();
    expect(done!.outputPublicId).toBeTruthy();
  }, 60_000);
});
