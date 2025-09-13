#!/usr/bin/env node
/**
 * Verify free build artifacts contain no Pro-specific strings.
 * Run after building with EDITION=free.
 */
import fs from 'fs';
import path from 'path';

const distDir = path.resolve(process.cwd(), 'dist');
const isFree = (process.env.EDITION || 'free').toLowerCase() === 'free';

if (!isFree) {
  process.exit(0);
}

if (!fs.existsSync(distDir)) {
  console.error('[check-free-artifacts] dist/ not found');
  process.exit(1);
}

/**
 * Blacklist of substrings that must NOT appear in free artifacts.
 * Keep specific to avoid false positives (e.g., 'pro' in 'profile').
 */
const blacklist = [
  'FireScope Pro',
  '[FireScope Pro]',
  'Pro features',
  'Pro edition',
  'requires Pro',
  '(Pro)',
  '(Pro only)',
  'Pro only',
  'Pro builds',
  'pro-specific',
  'VITE_EDITION',
  'firescope_pro_api_key',
  'api.firescope.app',
  'Options Page', // pro options wording shouldn't leak
  // ensure legacy filenames/sourcemaps don't leak edition naming
  'nav-button.free.js',
  'more-menu.free.js',
];

/**
 * File extensions to scan as text.
 */
const textExt = new Set(['.js', '.css', '.html', '.json', '.map']);

function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const violations = [];
for (const file of walk(distDir)) {
  const ext = path.extname(file).toLowerCase();
  if (!textExt.has(ext)) continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const term of blacklist) {
    if (content.includes(term)) {
      violations.push({ file, term });
    }
  }
}

if (violations.length) {
  console.error('[check-free-artifacts] Found Pro mentions in free build:');
  for (const v of violations) {
    console.error(` - ${v.file} contains: ${v.term}`);
  }
  process.exit(2);
}

console.log('[check-free-artifacts] OK — no Pro mentions in free artifacts');
