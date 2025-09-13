# CLAUDE.md

Concise guidance for Claude Code when working in this repo.

## Quick Start

- Prereqs: Node >= 20, pnpm. Install with `pnpm install`.
- Dev: `pnpm dev` (Vite) to load `src/devtools.html` in Chrome DevTools.
- Lint/format: `pnpm lint`, `pnpm format`.
- Tests: `pnpm test` (Vitest run), `pnpm test:watch` (interactive).

## Build Targets

- Free: `pnpm run build:free` → builds to `dist/` and verifies no Pro strings.
- Pro: `pnpm run build:pro` → Pro manifest/features.
- Both: `pnpm run build:both` → emits `firescope.zip` and `firescope-pro.zip`.
- Clean: `pnpm run build:clean`; CI bundle: `pnpm run build:ci`.

## Edition Rules (important)

- Aliases choose modules by edition:
  - `#nav-button`: Pro → `src/js/nav-button.pro.js`; Free → `src/js/nav-button.js` (stub).
  - `#more-menu`: Pro → `src/js/more-menu.pro.js`; Free → `src/js/more-menu.js`.
- Free build must not ship any “Pro” mentions. `scripts/check-free-artifacts.js` enforces this. If you add new Pro-only copy, update the blacklist if needed.

## Project Structure

- `src/` DevTools UI and background (MV3). Entry HTML: `src/panel.html`; key modules in `src/js/`.
- `config/manifest.free.json` and `config/manifest.pro.json` selected by Vite plugin.
- `assets/`, `scripts/`, `demo/`, `docs/`; output in `dist/` (do not edit).

## Notes for Changes

- Follow ESLint + Prettier; keep modules focused and small.
- Maintain MV3 permissions minimal; Pro uses `storage` and may add host permission for backend.
- Conventional Commits are enforced; ensure `pnpm lint` and `pnpm format` pass before committing.
