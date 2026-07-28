# FireScope Testing

FireScope's tests run on [Vitest](https://vitest.dev). There is no browser test
runner and no custom assertion framework: `pnpm test` runs everything, in Node,
and exits non-zero on the first failure.

## Running the tests

```bash
pnpm test        # single run, the same command CI runs
pnpm test:watch  # re-run on change
```

A single file, or a single test by name:

```bash
pnpm exec vitest run test/unit/query-exporter.test.js
pnpm exec vitest run -t 'a captured limit is never dropped'
```

Lint and format the test sources with `pnpm run lint:test` and
`pnpm run format:test`. `pnpm lint` covers `src/`, `demo/`, `scripts/` and
`test/` together.

## Layout

Everything lives in `test/unit/`. `vitest.config.js` picks up
`test/unit/**/*.test.js`, so a new file is collected as soon as it is named
`*.test.js`. Nothing has to be registered anywhere.

| File                          | What it covers                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `query-exporter.test.js`      | `QueryExporter` output for React, Next.js (client and server), Angular, Node, Flutter |
| `nav-button.pro.test.js`      | The Pro nav button: missing-API-key path, backend call, cache hit                     |
| `subscription-info.test.js`   | `subscription-info.js` API base normalisation, error codes, response formatting       |
| `import-contracts.test.js`    | Whole-class guard: every `new X()` and `X.method()` on an imported binding            |
| `module-reachability.test.js` | Whole-class guard: every `src/**/*.js` is reachable from a manifest entry point       |

The two guards are worth understanding before adding to them. This repo has no
typechecker, so a call site that misuses an imported binding, or a module that
stops being imported at all, produces no error anywhere:
`import-contracts.test.js` catches the first by checking call sites against the
real exported values, and `module-reachability.test.js` catches the second by
walking the import graph the build walks. Both fail with a list of offending
files rather than a single assertion, so a failure names every instance.

## Environment

`vitest.config.js` sets `environment: 'node'` and `globals: true`. A file that
needs a DOM opts in with a pragma on its first line, as
`nav-button.pro.test.js` does:

```javascript
/* @vitest-environment jsdom */
```

`chrome.*` is not provided by either environment. Tests that need it assign a
mock to `global.chrome`; see `setupChromeMocks` in `nav-button.pro.test.js`.

## Edition aliases

`vite.config.js` resolves `#nav-button` and `#more-menu` to a different module
per edition. `vitest.config.js` mirrors both aliases to their **free** targets,
because `free` is the default edition in `vite.config.js`. A test that cares
about the Pro variant imports it by path:

```javascript
import { createPanelNavButton } from '../../src/js/nav-button.pro.js';
```

If an alias is added to `vite.config.js`, add it to `vitest.config.js` and to
`EDITION_ALIASES` in both guard tests, or imports that resolve at build time
will fail to resolve under Vitest.

## Writing a test

```javascript
import { describe, it, expect } from 'vitest';
import { QueryExporter } from '../../src/js/query-exporter.js';

const row = {
  type: 'structured_query',
  collectionPath: 'orders',
  isCollectionGroup: false,
  filters: [
    { field: 'status', op: 'EQUAL', value: { stringValue: 'shipped' } },
  ],
  orderBy: [],
};

describe('QueryExporter: something specific', () => {
  it('states the behaviour, not the implementation', () => {
    expect(QueryExporter.toNode(row)).toContain(
      ".where('status', '==', \"shipped\")"
    );
  });
});
```

Two conventions the existing tests follow:

- Build fixtures from what `src/background.js` actually sends to the panel, not
  from what the module under test happens to accept. The exporter bugs fixed in
  this repo were all cases where the fixture was tidier than the real payload.
- Assert on the emitted string, not on internal state. These modules exist to
  produce text a user pastes into their own project, so that text is the
  contract.

## CI

`.github/workflows/semantic-release.yml` runs `pnpm run lint` then `pnpm test`
on Node 20 for every push to `master` and every merged pull request. The release
job does not run unless both pass.
