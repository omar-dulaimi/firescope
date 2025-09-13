#!/usr/bin/env node

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

const COLORS = {
  primary: '#FF6B35', // Firebase orange
  secondary: '#4338CA', // Indigo
  accent: '#F59E0B', // Amber
  gradient: ['#FF6B35', '#F59E0B', '#6366F1'], // Orange to amber to indigo
  text: '#1F2937',
  textLight: '#6B7280',
  background: '#FFFFFF',
  backgroundDark: '#111827',
};

class BrandGenerator {
  constructor() {
    this.assetsDir = path.join(process.cwd(), 'assets');
    this.iconsDir = path.join(this.assetsDir, 'icons');
    this.bannersDir = path.join(this.assetsDir, 'banners');
    this.socialDir = path.join(this.assetsDir, 'social');
  }

  async generateFireScopeLogo(size = 512) {
    const svg = `
      <svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="fireGradient" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" style="stop-color:${COLORS.primary};stop-opacity:1" />
            <stop offset="50%" style="stop-color:${COLORS.accent};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${COLORS.secondary};stop-opacity:1" />
          </linearGradient>
          <linearGradient id="scopeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${COLORS.secondary};stop-opacity:0.8" />
            <stop offset="100%" style="stop-color:${COLORS.primary};stop-opacity:0.8" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        <!-- Background circle -->
        <circle cx="256" cy="256" r="240" fill="url(#fireGradient)" opacity="0.1"/>
        
        <!-- Fire element - stylized flame -->
        <path d="M256 120 C276 120, 320 140, 320 180 C320 200, 310 220, 300 230 C320 240, 340 260, 340 290 C340 340, 300 380, 256 380 C212 380, 172 340, 172 290 C172 260, 192 240, 212 230 C202 220, 192 200, 192 180 C192 140, 236 120, 256 120 Z" 
              fill="url(#fireGradient)" filter="url(#glow)"/>
        
        <!-- Scope crosshairs -->
        <g stroke="url(#scopeGradient)" stroke-width="6" fill="none" opacity="0.9">
          <!-- Outer scope ring -->
          <circle cx="256" cy="256" r="200"/>
          <!-- Inner scope ring -->
          <circle cx="256" cy="256" r="160"/>
          
          <!-- Crosshair lines -->
          <line x1="56" y1="256" x2="136" y2="256"/>
          <line x1="376" y1="256" x2="456" y2="256"/>
          <line x1="256" y1="56" x2="256" y2="136"/>
          <line x1="256" y1="376" x2="256" y2="456"/>
          
          <!-- Corner marks -->
          <path d="M 156 156 L 176 156 L 176 176"/>
          <path d="M 356 156 L 336 156 L 336 176"/>
          <path d="M 356 356 L 336 356 L 336 336"/>
          <path d="M 156 356 L 176 356 L 176 336"/>
        </g>
        
        <!-- Center dot -->
        <circle cx="256" cy="256" r="8" fill="${COLORS.secondary}"/>
      </svg>
    `;

    return sharp(Buffer.from(svg)).png().resize(size, size);
  }

  async generateExtensionIcons() {
    const sizes = [16, 48, 128];
    const icons = {};

    for (const size of sizes) {
      const icon = await this.generateFireScopeLogo(size);
      const filename = `icon-${size}.png`;
      const filepath = path.join(this.iconsDir, filename);

      await icon.toFile(filepath);
      icons[size] = filename;
      console.log(`✓ Generated ${filename}`);
    }

    return icons;
  }

  async generateReadmeBanner() {
    const width = 1200;
    const height = 400;

    const svg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bannerBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#1F2937;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#111827;stop-opacity:1" />
          </linearGradient>
          <linearGradient id="titleGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:${COLORS.primary};stop-opacity:1" />
            <stop offset="50%" style="stop-color:${COLORS.accent};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${COLORS.secondary};stop-opacity:1" />
          </linearGradient>
        </defs>

        <!-- Background -->
        <rect width="${width}" height="${height}" fill="url(#bannerBg)"/>

        <!-- Decorative elements -->
        <circle cx="1000" cy="100" r="120" fill="${COLORS.primary}" opacity="0.1"/>
        <circle cx="1100" cy="300" r="80" fill="${COLORS.secondary}" opacity="0.1"/>
        <circle cx="200" cy="50" r="60" fill="${COLORS.accent}" opacity="0.1"/>

        <!-- Logo -->
        <g transform="translate(100, 100) scale(0.4)">
          <circle cx="256" cy="256" r="200" fill="none" stroke="url(#titleGradient)" stroke-width="6" opacity="0.6"/>
          <path d="M256 120 C276 120, 320 140, 320 180 C320 200, 310 220, 300 230 C320 240, 340 260, 340 290 C340 340, 300 380, 256 380 C212 380, 172 340, 172 290 C172 260, 192 240, 212 230 C202 220, 192 200, 192 180 C192 140, 236 120, 256 120 Z" 
                fill="url(#titleGradient)"/>
        </g>

        <!-- Title -->
        <text x="350" y="180" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="url(#titleGradient)">
          FireScope
        </text>

        <!-- Subtitle -->
        <text x="350" y="220" font-family="Arial, sans-serif" font-size="24" fill="#9CA3AF">
          Real-time Firestore monitoring in Chrome DevTools
        </text>

        <!-- Features -->
        <text x="350" y="260" font-family="Arial, sans-serif" font-size="16" fill="#6B7280">
          ✓ Debug queries with formatted request bodies
        </text>
        <text x="350" y="285" font-family="Arial, sans-serif" font-size="16" fill="#6B7280">
          ✓ JSON visualization and export capabilities
        </text>
        <text x="350" y="310" font-family="Arial, sans-serif" font-size="16" fill="#6B7280">
          ✓ Real-time monitoring and performance insights
        </text>
      </svg>
    `;

    const banner = await sharp(Buffer.from(svg))
      .png()
      .toFile(path.join(this.bannersDir, 'readme-banner.png'));

    console.log('✓ Generated readme-banner.png');
    return banner;
  }

  async generateSocialAssets() {
    // Twitter/X card (1200x630)
    const twitterSvg = `
      <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="socialBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#1F2937;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#111827;stop-opacity:1" />
          </linearGradient>
          <linearGradient id="socialGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:${COLORS.primary};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${COLORS.secondary};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="1200" height="630" fill="url(#socialBg)"/>
        
        <!-- Logo centered -->
        <g transform="translate(450, 165) scale(0.6)">
          <circle cx="256" cy="256" r="200" fill="none" stroke="url(#socialGrad)" stroke-width="6" opacity="0.6"/>
          <path d="M256 120 C276 120, 320 140, 320 180 C320 200, 310 220, 300 230 C320 240, 340 260, 340 290 C340 340, 300 380, 256 380 C212 380, 172 340, 172 290 C172 260, 192 240, 212 230 C202 220, 192 200, 192 180 C192 140, 236 120, 256 120 Z" 
                fill="url(#socialGrad)"/>
        </g>
        
        <text x="600" y="480" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="url(#socialGrad)" text-anchor="middle">
          FireScope
        </text>
        <text x="600" y="520" font-family="Arial, sans-serif" font-size="20" fill="#9CA3AF" text-anchor="middle">
          Chrome DevTools Extension for Firestore Monitoring
        </text>
      </svg>
    `;

    await sharp(Buffer.from(twitterSvg))
      .png()
      .toFile(path.join(this.socialDir, 'twitter-card.png'));

    // GitHub social preview (1280x640)
    const githubSvg = twitterSvg
      .replace('width="1200" height="630"', 'width="1280" height="640"')
      .replace('viewBox="0 0 1200 630"', 'viewBox="0 0 1280 640"');

    await sharp(Buffer.from(githubSvg))
      .png()
      .toFile(path.join(this.socialDir, 'github-social.png'));

    console.log('✓ Generated social media assets');
  }

  async updateManifest(icons) {
    const manifestPath = path.join(process.cwd(), 'manifest.json');
    const manifestContent = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);

    // Add icons to manifest
    manifest.icons = {};
    for (const [size, filename] of Object.entries(icons)) {
      manifest.icons[size] = `assets/icons/${filename}`;
    }

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log('✓ Updated manifest.json with icon paths');
  }

  async generate() {
    console.log('🎨 Generating FireScope brand assets...\n');

    try {
      // Generate extension icons
      const icons = await this.generateExtensionIcons();

      // Generate README banner
      await this.generateReadmeBanner();

      // Generate social media assets
      await this.generateSocialAssets();

      // Update manifest.json
      await this.updateManifest(icons);

      console.log('\n✅ Brand generation complete!');
      console.log('\nGenerated assets:');
      console.log('📁 assets/icons/ - Extension icons (16x16, 48x48, 128x128)');
      console.log('📁 assets/banners/ - README banner');
      console.log('📁 assets/social/ - Social media assets');
      console.log('\n🔧 manifest.json updated with icon paths');
    } catch (error) {
      console.error('❌ Error generating brand assets:', error);
      process.exit(1);
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new BrandGenerator();
  await generator.generate();
}

export default BrandGenerator;
