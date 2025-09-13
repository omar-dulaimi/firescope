# FireScope Brand Guidelines

## Overview

FireScope's brand combines the concepts of "Fire" (Firebase/Firestore) and "Scope" (monitoring/targeting) into a modern, technical visual identity suitable for developer tools.

## Logo Design

### Core Elements

- **Fire Element**: Stylized flame representing Firebase/Firestore
- **Scope Element**: Crosshair and targeting rings representing monitoring and precision
- **Modern Geometric Style**: Clean, scalable design optimized for small sizes

### Color Palette

```
Primary:   #FF6B35 (Firebase Orange)
Secondary: #4338CA (Indigo)
Accent:    #F59E0B (Amber)
Gradient:  Orange → Amber → Indigo
```

### Logo Variations

The logo combines a gradient flame with scope crosshairs, creating a unique mark that represents both Firebase monitoring and precision targeting.

## Assets Generated

### Extension Icons

- `icon-16.png` - Chrome extension toolbar
- `icon-48.png` - Extension management page
- `icon-128.png` - Chrome Web Store

### Marketing Assets

- `readme-banner.png` - GitHub repository header (1200×400)
- `twitter-card.png` - Social media sharing (1200×630)
- `github-social.png` - GitHub social preview (1280×640)

## Usage Guidelines

### Do's

✅ Use the full logo for primary branding
✅ Maintain adequate white space around the logo
✅ Use on dark backgrounds for best contrast
✅ Scale proportionally to maintain aspect ratio

### Don'ts

❌ Don't modify the colors or gradients
❌ Don't separate the fire and scope elements
❌ Don't use on low-contrast backgrounds
❌ Don't stretch or distort the logo

## Technical Specifications

### File Formats

- Primary: PNG with transparency
- Vector source: SVG (embedded in generation script)
- Color mode: RGB for digital use

### Minimum Sizes

- Extension icon: 16×16px minimum
- Logo usage: 32×32px minimum recommended
- Banner: Scalable, optimized for 1200px width

## Regenerating Assets

To regenerate all brand assets:

```bash
npm run brand:generate
```

This script uses Sharp.js to create all required assets from SVG source code, ensuring consistent quality and allowing easy modifications to the brand.

## Integration

The brand assets are automatically integrated into:

- `manifest.json` - Extension icons
- Available for README, documentation, and marketing use

---

_Brand assets generated using Sharp.js and custom SVG graphics_
