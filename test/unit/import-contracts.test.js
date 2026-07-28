import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// This repo is plain JavaScript with no typechecker, so nothing catches a call
// site that uses an imported binding in a way the exporting module cannot
// support: `new SomeNamespaceObject()`, or `Namespace.methodThatWasRenamed()`.
// Both throw a TypeError only when the line actually runs, and a line that only
// runs in a rarely-used branch (or in a module that is no longer bundled) can be
// wrong for a long time without anyone noticing.
//
// These tests read every module under src/, work out which bindings come from
// which local module, and check the two usages above against the real exported
// value. This is a whole-class guard, not a test of one function.

// `new URL(...)` would be the shorter spelling, but URL is not in the globals
// list in eslint.config.js, so `pnpm lint` rejects it.
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(TEST_DIR, '../../src');
const REPO_DIR = resolve(SRC_DIR, '..');

// vite.config.js maps these specifiers to a different file per edition, so both
// targets are checked. Keep in sync with `resolve.alias` in vite.config.js.
const EDITION_ALIASES = {
  '#nav-button': ['src/js/nav-button.js', 'src/js/nav-button.pro.js'],
  '#more-menu': ['src/js/more-menu.js', 'src/js/more-menu.pro.js'],
};

function listJsFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listJsFiles(full));
    else if (entry.name.endsWith('.js')) found.push(full);
  }
  return found.sort();
}

// Replaces comments, and optionally string/template/regex bodies, with spaces of
// the same length so that line numbers and offsets stay accurate. Regex literals
// are tracked because a body such as /'/g or /[^/]+/ would otherwise desync the
// scan; character classes are tracked for the same reason.
function scrub(src, { keepStrings = false } = {}) {
  const out = src.split('');
  const hide = i => {
    if (out[i] !== '\n') out[i] = ' ';
  };
  const hideLiteral = i => {
    if (!keepStrings) hide(i);
  };
  // Punctuation after which a `/` opens a regex rather than being division.
  const regexAfterChar = new Set([
    '',
    '(',
    ',',
    '=',
    ':',
    '[',
    '!',
    '&',
    '|',
    '?',
    '{',
    '}',
    ';',
    '+',
    '-',
    '*',
    '%',
    '<',
    '>',
    '^',
    '~',
    '\n',
  ]);
  const regexAfterWord = new Set([
    'return',
    'typeof',
    'instanceof',
    'in',
    'of',
    'new',
    'delete',
    'void',
    'case',
    'do',
    'else',
    'yield',
    'await',
  ]);

  // Frames let a `${...}` interpolation return to template mode at its own `}`.
  const frames = [{ template: false, braces: 0 }];
  let prevChar = '';
  let prevWord = '';
  let i = 0;

  while (i < src.length) {
    const frame = frames[frames.length - 1];
    const c = src[i];

    if (frame.template) {
      if (c === '\\') {
        hideLiteral(i);
        hideLiteral(i + 1);
        i += 2;
        continue;
      }
      if (c === '`') {
        hideLiteral(i);
        frames.pop();
        prevChar = '`';
        prevWord = '';
        i += 1;
        continue;
      }
      if (c === '$' && src[i + 1] === '{') {
        hideLiteral(i);
        hideLiteral(i + 1);
        frames.push({ template: false, braces: 0, fromTemplate: true });
        prevChar = '{';
        prevWord = '';
        i += 2;
        continue;
      }
      hideLiteral(i);
      i += 1;
      continue;
    }

    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') hide(i++);
      prevChar = '\n';
      prevWord = '';
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      hide(i);
      hide(i + 1);
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/'))
        hide(i++);
      if (i < src.length) {
        hide(i);
        hide(i + 1);
        i += 2;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      hideLiteral(i);
      i += 1;
      while (i < src.length) {
        if (src[i] === '\\') {
          hideLiteral(i);
          hideLiteral(i + 1);
          i += 2;
          continue;
        }
        if (src[i] === c) {
          hideLiteral(i);
          i += 1;
          break;
        }
        if (src[i] === '\n') break; // unterminated: stop rather than desync
        hideLiteral(i);
        i += 1;
      }
      prevChar = 'x';
      prevWord = '';
      continue;
    }
    if (c === '`') {
      hideLiteral(i);
      frames.push({ template: true, braces: 0 });
      i += 1;
      continue;
    }
    if (
      c === '/' &&
      (regexAfterChar.has(prevChar) || regexAfterWord.has(prevWord))
    ) {
      hideLiteral(i);
      i += 1;
      let inClass = false;
      while (i < src.length) {
        if (src[i] === '\\') {
          hideLiteral(i);
          hideLiteral(i + 1);
          i += 2;
          continue;
        }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '/' && !inClass) {
          hideLiteral(i);
          i += 1;
          break;
        } else if (src[i] === '\n') break; // unterminated: stop rather than desync
        hideLiteral(i);
        i += 1;
      }
      prevChar = 'x';
      prevWord = '';
      continue;
    }
    if (c === '}' && frame.fromTemplate && frame.braces === 0) {
      hideLiteral(i);
      frames.pop();
      i += 1;
      continue;
    }
    if (c === '{') frame.braces += 1;
    if (c === '}' && frame.braces > 0) frame.braces -= 1;

    if (/\S/.test(c)) prevChar = c;
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[\w$]/.test(src[j])) j += 1;
      prevWord = src.slice(i, j);
      prevChar = src[j - 1];
      i = j;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

const IMPORT_RE =
  /^[ \t]*import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\}|\*\s*as\s+([\w$]+)|([\w$]+))\s+from\s*['"]([^'"]+)['"]/gm;

// Maps each local binding name to the module specifier it was imported from.
function parseImports(sourceWithoutComments) {
  const bindings = new Map();
  for (const m of sourceWithoutComments.matchAll(IMPORT_RE)) {
    const [, defaultWithNamed, named, namespace, defaultOnly, specifier] = m;
    const add = (local, imported) =>
      bindings.set(local, { specifier, imported });
    if (defaultWithNamed) add(defaultWithNamed, 'default');
    if (defaultOnly) add(defaultOnly, 'default');
    if (namespace) add(namespace, '*');
    if (named) {
      for (const part of named.split(',')) {
        const piece = part.trim();
        if (!piece) continue;
        const [imported, local] = piece.split(/\s+as\s+/).map(s => s.trim());
        add(local || imported, imported);
      }
    }
  }
  return bindings;
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

// Which files a specifier can resolve to. Bare (npm) specifiers are skipped:
// this guard is about the repo's own modules.
function resolveSpecifier(specifier, importerFile) {
  if (EDITION_ALIASES[specifier]) {
    return EDITION_ALIASES[specifier].map(p => resolve(REPO_DIR, p));
  }
  if (specifier.startsWith('.')) {
    return [resolve(dirname(importerFile), specifier)];
  }
  return [];
}

const moduleCache = new Map();
async function loadModule(file) {
  if (!moduleCache.has(file)) {
    moduleCache.set(file, import(pathToFileURL(file).href));
  }
  return moduleCache.get(file);
}

// True only for values with a [[Construct]] slot. Reflect.construct with `value`
// as newTarget throws for anything that cannot be `new`ed, and constructs the
// empty function rather than running `value`, so this has no side effects.
function isConstructible(value) {
  if (typeof value !== 'function') return false;
  try {
    Reflect.construct(function () {}, [], value);
    return true;
  } catch {
    return false;
  }
}

const sourceFiles = listJsFiles(SRC_DIR);

// Every `new Identifier(` and `new Identifier.member(` in a file, with its line.
function findNewSites(codeOnly) {
  const sites = [];
  const re = /\bnew\s+([A-Za-z_$][\w$]*)\s*(?:\.\s*([A-Za-z_$][\w$]*)\s*)?\(/g;
  for (const m of codeOnly.matchAll(re)) {
    sites.push({ root: m[1], member: m[2], line: lineOf(codeOnly, m.index) });
  }
  return sites;
}

// Every `Identifier.member(` call in a file, with its line.
function findMemberCalls(codeOnly) {
  const calls = [];
  const re = /(?<!\.)\b([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
  for (const m of codeOnly.matchAll(re)) {
    if (codeOnly.slice(0, m.index).match(/\bnew\s+$/)) continue;
    calls.push({ root: m[1], member: m[2], line: lineOf(codeOnly, m.index) });
  }
  return calls;
}

const scanned = sourceFiles.map(file => {
  const raw = readFileSync(file, 'utf8');
  const codeOnly = scrub(raw);
  return {
    file,
    rel: file.slice(REPO_DIR.length + 1),
    raw,
    codeOnly,
    bindings: parseImports(scrub(raw, { keepStrings: true })),
  };
});

describe('source scanner', () => {
  // If the literal scrubber ever desyncs, string bodies leak into the scanned
  // code and every check below silently loses its meaning. A leaked quote is the
  // symptom, so assert it directly.
  it.each(scanned.map(s => [s.rel, s]))(
    'strips every string, template and regex body in %s',
    (_rel, entry) => {
      expect(entry.codeOnly).not.toMatch(/['"`]/);
      expect(entry.codeOnly).toHaveLength(entry.raw.length);
    }
  );

  it('resolves both edition targets of every aliased specifier', () => {
    for (const targets of Object.values(EDITION_ALIASES)) {
      for (const target of targets) {
        expect(existsSync(resolve(REPO_DIR, target))).toBe(true);
      }
    }
  });
});

describe('imported bindings are used the way their module exports them', () => {
  it('only calls `new` on bindings that are actually constructible', async () => {
    const violations = [];
    for (const entry of scanned) {
      for (const site of findNewSites(entry.codeOnly)) {
        if (site.member) continue; // `new ns.Thing()` is checked below
        const binding = entry.bindings.get(site.root);
        if (!binding) continue; // a global or a locally declared class
        for (const target of resolveSpecifier(binding.specifier, entry.file)) {
          const mod = await loadModule(target);
          const value = binding.imported === '*' ? mod : mod[binding.imported];
          if (!isConstructible(value)) {
            violations.push(
              `${entry.rel}:${site.line} calls \`new ${site.root}()\`, but ` +
                `${binding.specifier} exports ${site.root} as ` +
                `${value === undefined ? 'nothing' : typeof value} ` +
                `(not a constructor)`
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('only calls methods that exist on imported namespace objects', async () => {
    const violations = [];
    for (const entry of scanned) {
      for (const call of findMemberCalls(entry.codeOnly)) {
        const binding = entry.bindings.get(call.root);
        if (!binding || binding.imported === '*') continue;
        for (const target of resolveSpecifier(binding.specifier, entry.file)) {
          const mod = await loadModule(target);
          const value = mod[binding.imported];
          // Only plain namespace objects are checked. Functions and classes may
          // gain members at runtime, and an object that is empty under Node
          // (one built from `document` lookups, say) says nothing about the
          // browser.
          if (
            value === null ||
            typeof value !== 'object' ||
            Object.keys(value).length === 0
          ) {
            continue;
          }
          if (!(call.member in value)) {
            violations.push(
              `${entry.rel}:${call.line} calls \`${call.root}.${call.member}()\`, ` +
                `but ${binding.specifier} exports no such member on ` +
                `${call.root} (has: ${Object.keys(value).join(', ')})`
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
