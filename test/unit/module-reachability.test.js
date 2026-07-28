import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Nothing in this repo fails when a module under src/ stops being imported. Vite
// only bundles what an entry point reaches, so an orphaned module keeps linting,
// keeps its tests green, and ships in neither zip. Two such islands have already
// been found and deleted (src/js/main.js and its managers, then
// src/js/console-link-utils.js with src/js/config.js), and in both cases the
// stale code read as live code for as long as it sat there.
//
// This walks the same graph the build walks, from the entry points the two
// manifests declare, and fails on any src/**/*.js the walk never reaches.

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = resolve(TEST_DIR, '../..');
const SRC_DIR = join(REPO_DIR, 'src');

const MANIFESTS = ['config/manifest.free.json', 'config/manifest.pro.json'];

// vite.config.js maps these specifiers to a different file per edition. Both
// targets count as reachable: each ships in the edition that selects it.
// Keep in sync with `resolve.alias` in vite.config.js.
const EDITION_ALIASES = {
  '#nav-button': ['src/js/nav-button.js', 'src/js/nav-button.pro.js'],
  '#more-menu': ['src/js/more-menu.js', 'src/js/more-menu.pro.js'],
};

function listFiles(dir, ext) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(full, ext));
    else if (entry.name.endsWith(ext)) found.push(full);
  }
  return found.sort();
}

// A commented-out import must not make a module look reachable, so whole-line
// comments are dropped before anything is matched.
function withoutLineComments(source) {
  return source
    .split('\n')
    .filter(line => !/^\s*\/\//.test(line))
    .join('\n');
}

// The clause between the keyword and `from` may wrap over several lines, as it
// does in src/js/options.js, so this cannot be line-bounded. Restricting the gap
// to characters a clause can contain keeps it from running past a statement.
const IMPORT_RE =
  /^[ \t]*(?:import|export)\s+[\w$*{},\s]*?\bfrom\s*['"]([^'"]+)['"]/gm;
const BARE_IMPORT_RE = /^[ \t]*import\s*['"]([^'"]+)['"]/gm;
const HTML_REF_RE = /['"]([^'"]*\.html)['"]/g;
const HTML_SCRIPT_RE = /<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

// Which repo files a specifier can resolve to. Bare (npm) specifiers resolve to
// nothing here: this walk is about the repo's own modules.
function resolveSpecifier(specifier, importerFile) {
  if (EDITION_ALIASES[specifier]) {
    return EDITION_ALIASES[specifier].map(p => join(REPO_DIR, p));
  }
  if (specifier.startsWith('.')) {
    return [resolve(dirname(importerFile), specifier)];
  }
  if (specifier.startsWith('@/')) {
    return [join(REPO_DIR, 'src', specifier.slice(2))];
  }
  return [];
}

// An HTML path written inside a JS string (devtools.js names src/panel.html for
// chrome.devtools.panels.create) is relative to the packed extension root, which
// mirrors the repo root. Fall back to a path relative to the referring file.
function resolveHtmlRef(ref, referrerFile) {
  const candidates = [join(REPO_DIR, ref), resolve(dirname(referrerFile), ref)];
  return candidates.filter(existsSync);
}

function collectEntryPoints() {
  const entries = new Set();
  for (const manifestPath of MANIFESTS) {
    const full = join(REPO_DIR, manifestPath);
    const manifest = JSON.parse(readFileSync(full, 'utf8'));
    for (const declared of [
      manifest.background?.service_worker,
      manifest.devtools_page,
      manifest.options_ui?.page,
    ]) {
      if (declared) entries.add(join(REPO_DIR, declared));
    }
  }
  return [...entries].sort();
}

function walk(entryPoints) {
  const reached = new Set();
  const missing = [];
  const queue = [...entryPoints];

  while (queue.length) {
    const file = queue.pop();
    if (reached.has(file)) continue;
    if (!existsSync(file)) {
      missing.push(relative(REPO_DIR, file));
      continue;
    }
    reached.add(file);
    const source = readFileSync(file, 'utf8');

    if (file.endsWith('.html')) {
      for (const m of source.matchAll(HTML_SCRIPT_RE)) {
        queue.push(resolve(dirname(file), m[1]));
      }
      continue;
    }

    const code = withoutLineComments(source);
    for (const re of [IMPORT_RE, BARE_IMPORT_RE]) {
      for (const m of code.matchAll(re)) {
        queue.push(...resolveSpecifier(m[1], file));
      }
    }
    for (const m of code.matchAll(HTML_REF_RE)) {
      queue.push(...resolveHtmlRef(m[1], file));
    }
  }

  return { reached, missing };
}

describe('every module under src/ ships in at least one edition', () => {
  const entryPoints = collectEntryPoints();
  const { reached, missing } = walk(entryPoints);

  it('finds the entry points the manifests declare', () => {
    // If a manifest key is ever renamed this walk would silently start from
    // nothing and pass while reaching zero files, so pin the entry points.
    expect(entryPoints.map(f => relative(REPO_DIR, f))).toEqual([
      'src/background.js',
      'src/devtools.html',
      'src/options.html',
    ]);
    expect(missing).toEqual([]);
  });

  it('reaches every src/**/*.js from an entry point', () => {
    const orphans = listFiles(SRC_DIR, '.js')
      .filter(file => !reached.has(file))
      .map(file => relative(REPO_DIR, file));
    expect(orphans).toEqual([]);
  });
});
