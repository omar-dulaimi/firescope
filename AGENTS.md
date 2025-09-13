# Repository Guidelines

## Structure

- `src/`: Extension source (DevTools UI, background). Key: `src/panel.html`, `src/js/*`.
- `config/`: Edition manifests (`manifest.free.json`, `manifest.pro.json`).
- `assets/`, `scripts/`, `demo/`, `docs/`; output in `dist/` (generated; do not edit).

## Commands

- `pnpm dev`: Start Vite for local development.
- `pnpm build:free` / `pnpm build:pro`: Build selected edition to `dist/`.
- `pnpm build:both`: Produce `firescope.zip` and `firescope-pro.zip`.
- `pnpm test` / `pnpm test:watch`: Vitest run/watch.
- `pnpm lint` / `pnpm format`: ESLint and Prettier.
- Helpful: `pnpm demo:website`, `pnpm demo:seed`, `pnpm sync:demo-env`.

## Style & Organization

- ES modules; Prettier defaults; ESLint config in `eslint.config.js`.
- File names: kebab-case (`request-processor.js`). Keep modules focused (UI `*-manager.js`, processors `*processor.js`).

## Testing

- Prefer logic tests over DOM coupling. Use Vitest `describe/it/expect`.
- Put related scenarios near the code they cover.

## Editions

- Vite alias selects edition modules:
  - `#nav-button`: Pro → `src/js/nav-button.pro.js`; Free → `src/js/nav-button.js`.
  - `#more-menu`: Pro → `src/js/more-menu.pro.js`; Free → `src/js/more-menu.js`.
- Free build must not include any “Pro” mentions. The post-build checker enforces this.

## PRs & Security

- Conventional Commits required. Run `pnpm lint` and `pnpm format` before pushing.
- Don’t commit secrets. Use `.env.example`; Pro options page stores keys via `chrome.storage`.
- Manifest V3: keep permissions minimal; confirm when adding capabilities.
