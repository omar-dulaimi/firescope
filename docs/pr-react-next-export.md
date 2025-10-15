 # feat: add React and Next.js query exports

 ## Summary
 Adds query-only export options for React and Next.js:
 - React (Web SDK) — build a `query` and `getDocs`, assuming an existing `db`.
 - Next.js (Client, Web SDK) — same as React, labeled for Next.
 - Next.js (Server, Admin SDK) — server-side query using `admin.firestore()`.

 This follows FireScope’s approach: users handle setup; we only generate the query.

 ## Changes
 - src/js/query-exporter.js
   - add: `toReact`, `toNextClient`, `toNextServer` exporters
 - src/js/panel.js
   - add: Export menu items for React, Next.js (Client), Next.js (Server)
 - docs/export-react-next-plan.md
   - add: plan outlining supported React/Next.js patterns and exporter presets

 ## Rationale
 - Frequent user need to paste Firestore queries into React/Next apps.
 - Keeps exports minimal and framework-idiomatic without setup boilerplate.

 ## Notes
 - No bundling of Admin SDK on client — server-only snippet is clearly labeled.
 - Collection group queries auto-map to `collectionGroup`.
 - No changes to RequestProcessor or network capture logic.

 ## Testing
 - `pnpm test` passed locally.
 - `pnpm lint` shows only existing warnings unrelated to this change.

 ## Checklist
 - [x] Conventional commits
 - [x] Scoped changes (exporter, panel, docs)
 - [x] Lint/format run
 - [x] Minimal surface area; no unrelated refactors

 ## Screenshots
 N/A — copy-to-clipboard snippets rendered in the export menu.

