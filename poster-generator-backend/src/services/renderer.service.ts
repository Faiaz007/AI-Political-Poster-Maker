import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import puppeteer, { type Browser } from 'puppeteer';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { buildPosterHtml, type BuildHtmlInput } from '../renderers/html.builder';

/**
 * Launching Chromium costs roughly half a second and holds on to a lot of
 * memory, so the process is started once and shared. Each render then only
 * pays for a fresh page.
 */
const MAX_CONCURRENT_RENDERS = 2;
const RENDER_TIMEOUT_MS = 45_000;

/** Round-robins over the pages in a small pool to avoid per-render page setup. */
class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= MAX_CONCURRENT_RENDERS) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      const next = this.waiters.shift();
      next?.();
    }
  }
}

export class RendererService {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private readonly semaphore = new Semaphore();

  private profileDir: string | null = null;

  /**
   * A writable profile directory is required even for headless Chromium when
   * running as a non-root user in a container, and it also isolates renders
   * from any ambient browser state.
   *
   * The directory is unique per process on purpose. Chromium takes an exclusive
   * lock on its profile, so a fixed shared path would mean a second instance, or
   * a restart after an unclean shutdown, cannot launch at all — and a
   * `SingletonLock` left behind by a killed Chromium would wedge the renderer
   * permanently rather than just failing once.
   */
  private ensureProfileDir(): string {
    if (this.profileDir) return this.profileDir;
    const dir = path.join(tmpdir(), `poster-renderer-${process.pid}-${randomUUID().slice(0, 8)}`);
    mkdirSync(dir, { recursive: true });
    this.profileDir = dir;
    return dir;
  }

  /** Removes the throwaway profile so /tmp does not accumulate one per boot. */
  private cleanupProfileDir(): void {
    if (!this.profileDir) return;
    rmSync(this.profileDir, { recursive: true, force: true });
    this.profileDir = null;
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;

    // Concurrent callers must await the same launch, not race to start several.
    if (!this.launching) {
      this.launching = this.launch().finally(() => {
        this.launching = null;
      });
    }
    return this.launching;
  }

  private async launch(): Promise<Browser> {
    logger.info('Launching Chromium', { headless: true });
    const browser = await puppeteer.launch({
      headless: true,
      userDataDir: this.ensureProfileDir(),
      args: [
        // Required in most container images: Chromium's sandbox needs privileges
        // that are not available, so the process-level sandbox is disabled and
        // isolation is left to the container itself.
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
        '--force-color-profile=srgb',
        '--hide-scrollbars',
        '--disable-lcd-text',
        '--lang=bn-BD',
      ],
    });
    this.browser = browser;
    browser.on('disconnected', () => {
      logger.warn('Chromium disconnected, will relaunch on next render');
      this.browser = null;
    });
    return browser;
  }

  /**
   * Renders a poster and returns the PNG as a Buffer.
   *
   * Fonts, styles and decoration SVGs are all inlined, and the page is blocked
   * from making any network request, so the same input always produces the same
   * bytes.
   */
  async render(input: BuildHtmlInput): Promise<Buffer> {
    return this.semaphore.run(async () => {
      const browser = await this.getBrowser();
      const page = await browser.newPage();
      const startedAt = Date.now();

      try {
        await page.setViewport({
          width: input.canvas.width,
          height: input.canvas.height,
          deviceScaleFactor: 1,
        });

        const html = buildPosterHtml(input);
        // `load` (not `networkidle`) is correct here: the document is fully
        // self-contained apart from the user's own photos, and `load` already
        // waits for those images to finish decoding.
        await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });

        // Bangla shaping depends on the font actually being loaded; without this
        // the first paint can fall back to a font without conjunct support.
        // Passed as a string so this file needs no DOM lib types.
        await page.evaluate('document.fonts.ready');

        const screenshot = await page.screenshot({
          type: 'png',
          fullPage: false,
          captureBeyondViewport: false,
        });
        const buffer = Buffer.from(screenshot);

        logger.info('Poster rendered', {
          latencyMs: Date.now() - startedAt,
          width: input.canvas.width,
          height: input.canvas.height,
          bytes: buffer.length,
        });

        return buffer;
      } finally {
        await page.close().catch(() => undefined);
      }
    });
  }

  async close(): Promise<void> {
    if (this.browser?.connected) {
      await this.browser.close();
      logger.info('Chromium closed');
    }
    this.browser = null;
    this.cleanupProfileDir();
  }
}

export const rendererService = new RendererService();

/** Ensures Chromium is available so the first user request is not the slow one. */
export async function warmUpRenderer(): Promise<void> {
  if (env.NODE_ENV === 'test') return;
  try {
    await rendererService.render({
      canvas: { width: 200, height: 200 },
      layoutConfig: { photoSlots: [], textSlots: [], decoration: { allowed: [] }, footer: { enabled: false, height: 0, backgroundColor: '#000000', textColor: '#ffffff', prefix: '' } },
      layout: {
        layoutVariant: 'three_top',
        palette: { primary: '#006A4E', secondary: '#F42A41', accent: '#FFFFFF' },
        photoLayout: 'three_top',
        headlineStyle: 'large_center',
        backgroundDecoration: [],
        headlineScale: 1,
        footerStyle: 'dark_bar',
      },
      copy: { headline: 'পরীক্ষা' },
      photoUrls: [],
      backgroundUrl: null,
      fallbackPalette: { primary: '#006A4E', secondary: '#F42A41', accent: '#FFFFFF' },
    });
    logger.info('Renderer warm-up complete');
  } catch (error) {
    logger.warn('Renderer warm-up failed', { message: (error as Error).message });
  }
}
