/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPanelNavButton } from '../../src/js/nav-button.pro.js';

function setupChromeMocks({ apiKey = '', cached = null } = {}) {
  const syncStore = { firescope_pro_api_key: apiKey };
  const localStore = cached || null;

  global.chrome = {
    storage: {
      sync: {
        get: vi.fn((keys, cb) => cb({ ...syncStore })),
        set: vi.fn((vals, cb) => {
          Object.assign(syncStore, vals);
          cb && cb();
        }),
      },
      local: {
        get: vi.fn((keys, cb) => {
          if (Array.isArray(keys)) {
            cb({ [keys[0]]: localStore });
          } else if (typeof keys === 'string') {
            cb({ [keys]: localStore });
          } else {
            cb({});
          }
        }),
        set: vi.fn((obj, cb) => {
          // store whatever was set as the only cached value
          cb && cb();
        }),
      },
    },
    runtime: {
      openOptionsPage: vi.fn(),
    },
  };
}

describe('Pro nav button', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // mock window.open
    window.open = vi.fn();
    // default fetch mock
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ url: 'https://example.com/fb' }),
    }));
  });

  it('opens options page when API key is missing', async () => {
    setupChromeMocks({ apiKey: '' });
    const btn = createPanelNavButton(
      'https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents',
      {
        collectionPath: 'Users',
        filters: [],
        orderBy: [],
      }
    );
    // click
    btn.click();
    // allow async handlers to resolve
    await new Promise(r => setTimeout(r, 0));

    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('calls backend and opens url when key exists and cache miss', async () => {
    setupChromeMocks({ apiKey: 'abc123', cached: null });

    const btn = createPanelNavButton(
      'https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents',
      {
        collectionPath: 'Users',
        filters: [{ field: 'age', op: '>=', value: 18 }],
        orderBy: [{ field: 'name', direction: 'ASCENDING' }],
        isCollectionGroup: false,
        type: 'structured_query',
      }
    );
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    expect(fetch).toHaveBeenCalled();
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toMatch(/\/link$/);
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer abc123');
    expect(window.open).toHaveBeenCalledWith(
      'https://example.com/fb',
      '_blank'
    );
  });

  it('uses cache when available', async () => {
    const future = Date.now() + 60_000;
    setupChromeMocks({
      apiKey: 'key',
      cached: { url: 'https://cached/url', expiresAt: future },
    });

    const btn = createPanelNavButton(
      'https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents',
      {
        collectionPath: 'Users',
        filters: [],
        orderBy: [],
      }
    );
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    expect(fetch).not.toHaveBeenCalled();
    expect(window.open).toHaveBeenCalledWith('https://cached/url', '_blank');
  });
});
