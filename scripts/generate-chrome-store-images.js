#!/usr/bin/env node

/**
 * Chrome Web Store Image Generator
 *
 * Generates required images for Chrome Web Store listing from existing screenshots:
 * - Screenshots: 1280x800 or 640x400 (JPEG/PNG)
 * - Small promo tile: 440x280 (JPEG/PNG)
 * - Marquee promo tile: 1400x560 (JPEG/PNG)
 */

import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// CLI args (very small parser: --key=value)
function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith('--')) continue;
    const [k, v = 'true'] = arg.replace(/^--/, '').split('=');
    out[k] = v;
  }
  return out;
}

const args = parseArgs(process.argv);
const outputFormat = /^png$/i.test(args.format) ? 'png' : 'jpeg'; // default jpeg
const outputExt = outputFormat === 'jpeg' ? 'jpg' : 'png';
const quality = Number.isFinite(Number(args.quality))
  ? Number(args.quality)
  : outputFormat === 'jpeg'
    ? 100
    : 90;
const useDarkBg = (args.bg || 'dark').toLowerCase() !== 'light';
const bgColor = useDarkBg
  ? { r: 15, g: 23, b: 42, alpha: 1 }
  : { r: 255, g: 255, b: 255, alpha: 1 };

// Configuration
const CONFIG = {
  screenshots: {
    sourceDir: 'assets/screenshots',
    outputDir: 'assets/chrome-store/screenshots',
    sizes: [
      { width: 1280, height: 800 },
      { width: 640, height: 400 },
    ],
    format: outputFormat, // default: jpeg
    quality,
  },
  smallPromo: {
    sourceDir: 'assets/screenshots',
    outputDir: 'assets/chrome-store',
    size: { width: 440, height: 280 },
    filename: `promo-tile-small.${outputExt}`,
    format: outputFormat,
    quality,
  },
  marqueePromo: {
    sourceDir: 'assets/screenshots',
    outputDir: 'assets/chrome-store',
    size: { width: 1400, height: 560 },
    filename: `promo-tile-marquee.${outputExt}`,
    format: outputFormat,
    quality,
  },
};

/**
 * Ensure output directory exists
 */
async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

/**
 * Get list of screenshot files
 */
async function getScreenshotFiles() {
  const screenshotDir = path.join(rootDir, CONFIG.screenshots.sourceDir);
  try {
    const files = await fs.readdir(screenshotDir);
    return files
      .filter(file => /\.(png|jpg|jpeg)$/i.test(file))
      .sort()
      .slice(0, 5); // Maximum 5 screenshots
  } catch (error) {
    console.error(`Error reading screenshot directory: ${error.message}`);
    return [];
  }
}

/**
 * Process a single image
 */
async function processImage(inputPath, outputPath, options) {
  try {
    // Resize without cropping: keep full screenshot, add padding to target size
    // Default background is dark (slate-900) unless overridden
    const bg = options.background || bgColor;

    let pipeline = sharp(inputPath)
      .resize(options.width, options.height, {
        fit: 'contain',
        position: 'center',
        background: bg,
        kernel: sharp.kernel.lanczos3,
        fastShrinkOnLoad: false,
      })
      // Ensure no transparency and consistent canvas size
      .flatten({ background: bg })
      .extend({ top: 0, bottom: 0, left: 0, right: 0, background: bg });

    // Optional post-resize sharpening for small targets to reduce perceived blur
    if (options.sharpen) {
      // Light unsharp mask; tweakable via sharpenSigma
      pipeline = pipeline.sharpen(options.sharpenSigma || 1.0);
    }

    // Optional gentle gamma to improve perceived contrast after downscale
    if (options.gamma) {
      pipeline = pipeline.gamma(options.gamma);
    }

    // Remove alpha channel for 24-bit images
    if (options.format === 'png') {
      pipeline = pipeline.png({
        quality: Math.min(100, Math.max(0, options.quality)),
        compressionLevel: 9,
        adaptiveFiltering: false,
        palette: false, // Ensure 24-bit
      });
    } else if (options.format === 'jpeg' || options.format === 'jpg') {
      pipeline = pipeline.jpeg({
        quality: Math.min(100, Math.max(0, options.quality)),
        mozjpeg: true,
        progressive: true,
        chromaSubsampling: '4:4:4', // Preserve text sharpness
      });
    }

    await pipeline.toFile(outputPath);
    console.log(`✓ Generated: ${path.relative(rootDir, outputPath)}`);
  } catch (error) {
    console.error(`✗ Error processing ${inputPath}: ${error.message}`);
  }
}

/**
 * Generate screenshots in required sizes
 */
async function generateScreenshots() {
  const screenshotFiles = await getScreenshotFiles();

  if (screenshotFiles.length === 0) {
    console.log('No screenshot files found in assets/screenshots/');
    return;
  }

  console.log(`Found ${screenshotFiles.length} screenshot(s)`);

  for (const size of CONFIG.screenshots.sizes) {
    const sizeDir = path.join(
      rootDir,
      CONFIG.screenshots.outputDir,
      `${size.width}x${size.height}`
    );
    await ensureDir(sizeDir);

    for (let i = 0; i < screenshotFiles.length; i++) {
      const inputPath = path.join(
        rootDir,
        CONFIG.screenshots.sourceDir,
        screenshotFiles[i]
      );
      const outputPath = path.join(
        sizeDir,
        `screenshot-${i + 1}.${CONFIG.screenshots.format}`
      );

      await processImage(inputPath, outputPath, {
        width: size.width,
        height: size.height,
        format: CONFIG.screenshots.format,
        quality: CONFIG.screenshots.quality,
        background: bgColor,
        sharpen: true,
        // Slightly stronger sharpen for smaller targets
        sharpenSigma: size.width <= 640 ? 1.3 : 1.1,
        gamma: 1.05,
      });
    }
  }
}

/**
 * Generate promo tiles
 */
async function generatePromoTiles() {
  const screenshotFiles = await getScreenshotFiles();

  if (screenshotFiles.length === 0) {
    console.log('No screenshot files found for promo tiles');
    return;
  }

  // Use the first screenshot for promo tiles
  const sourceImage = path.join(
    rootDir,
    CONFIG.screenshots.sourceDir,
    screenshotFiles[0]
  );

  // Small promo tile
  await ensureDir(path.join(rootDir, CONFIG.smallPromo.outputDir));
  const smallPromoPath = path.join(
    rootDir,
    CONFIG.smallPromo.outputDir,
    CONFIG.smallPromo.filename
  );
  await processImage(sourceImage, smallPromoPath, {
    width: CONFIG.smallPromo.size.width,
    height: CONFIG.smallPromo.size.height,
    format: CONFIG.smallPromo.format,
    quality: CONFIG.smallPromo.quality,
    background: bgColor,
    sharpen: true,
    sharpenSigma: 1.1,
  });

  // Marquee promo tile
  const marqueePromoPath = path.join(
    rootDir,
    CONFIG.marqueePromo.outputDir,
    CONFIG.marqueePromo.filename
  );
  await processImage(sourceImage, marqueePromoPath, {
    width: CONFIG.marqueePromo.size.width,
    height: CONFIG.marqueePromo.size.height,
    format: CONFIG.marqueePromo.format,
    quality: CONFIG.marqueePromo.quality,
    background: bgColor,
    sharpen: true,
    sharpenSigma: 0.9,
  });
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 Chrome Web Store Image Generator');
  console.log('=====================================\n');

  try {
    // Generate screenshots
    console.log('📸 Generating screenshots...');
    await generateScreenshots();

    // Generate promo tiles
    console.log('\n🎨 Generating promo tiles...');
    await generatePromoTiles();

    console.log('\n✅ All images generated successfully!');
    console.log('\n📁 Output directories:');
    console.log(`   - Screenshots: ${CONFIG.screenshots.outputDir}/`);
    console.log(`   - Promo tiles: ${CONFIG.smallPromo.outputDir}/`);
  } catch (error) {
    console.error('❌ Error generating images:', error.message);
    process.exit(1);
  }
}

// Run the script
main();
