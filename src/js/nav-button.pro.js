// Pro edition: navigation button that calls remote API to get a Console URL
/* global fetch */

function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
}

async function getApiKey() {
  return new Promise(resolve => {
    try {
      chrome.storage.sync.get(['firescope_pro_api_key'], res => {
        resolve(res.firescope_pro_api_key || '');
      });
    } catch (_e) {
      resolve('');
    }
  });
}

async function openOptionsIfNoKey() {
  const key = await getApiKey();
  if (!key) {
    try {
      chrome.runtime.openOptionsPage();
    } catch (e) {
      console.warn('[FireScope Pro] Failed to open options page:', e);
    }
    return false;
  }
  return true;
}

async function getFromCache(cacheKey) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get([cacheKey], res => {
        resolve(res[cacheKey] || null);
      });
    } catch (e) {
      console.warn('[FireScope Pro] Cache read failed:', e);
      resolve(null);
    }
  });
}

async function setInCache(cacheKey, value) {
  return new Promise(resolve => {
    try {
      const obj = {};
      obj[cacheKey] = value;
      chrome.storage.local.set(obj, () => resolve());
    } catch (e) {
      console.warn('[FireScope Pro] Cache write failed:', e);
      resolve();
    }
  });
}

function normalizePayload(base) {
  console.log(
    'uniqueKey: normalizePayload 1=> base: ',
    JSON.stringify(base, null, 2)
  );
  // Keep payload minimal: avoid sending raw documents, only query fields
  return {
    firebaseUrl: base.firebaseUrl || null,
    collectionPath: base.collectionPath || null,
    isCollectionGroup: !!base.isCollectionGroup,
    filters: base.filters || [],
    orderBy: base.orderBy || [],
    aggregations: base.aggregations || [],
    limit: typeof base.limit === 'number' ? base.limit : null,
    type: base.type || null,
    documentId: base.documentId || null,
  };
}

async function requestUrlFromServer(payload) {
  console.log(
    'uniqueKey: requestUrlFromServer 1=> payload: ',
    JSON.stringify(payload, null, 2)
  );
  const apiBase = import.meta.env.VITE_PRO_API_BASE;
  const key = await getApiKey();
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  const data = await res.json();
  return data?.url || null;
}

function buildCacheKey(payload) {
  const canonical = JSON.stringify(payload);
  return `firescope_pro_cache_${djb2Hash(canonical)}`;
}

async function handleClickGetUrl(payload) {
  console.log(
    'uniqueKey: handleClickGetUrl 1=> payload: ',
    JSON.stringify(payload, null, 2)
  );

  const hasKey = await openOptionsIfNoKey();
  if (!hasKey) return null;

  const normalized = normalizePayload(payload);
  console.log('uniqueKey: handleClickGetUrl 2=> normalized: ', normalized);
  const cacheKey = buildCacheKey(normalized);
  const cached = await getFromCache(cacheKey);
  const now = Date.now();
  if (cached && cached.url && cached.expiresAt && cached.expiresAt > now) {
    return cached.url;
  }

  const url = await requestUrlFromServer(normalized);
  console.log(
    'uniqueKey: handleClickGetUrl 3=> url: ',
    JSON.stringify(url, null, 2)
  );

  if (url) {
    // Cache for 24 hours
    await setInCache(cacheKey, { url, expiresAt: now + 24 * 60 * 60 * 1000 });
  }
  return url;
}

export function createPanelNavButton(firebaseUrl, req) {
  console.log(
    'uniqueKey: createPanelNavButton => req: ',
    JSON.stringify(req, null, 2)
  );
  const navButton = document.createElement('button');
  navButton.className = 'nav-button';
  navButton.innerHTML =
    '<svg class="nav-icon" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H11V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V13H19V19Z"/></svg>';
  navButton.title = `Open ${req.collectionPath || req.collection} in Firebase Console`;
  navButton.style.cssText =
    'margin-left: 8px; padding: 4px 8px; background: rgba(66, 133, 244, 0.1); border: 1px solid rgba(66, 133, 244, 0.3); border-radius: 4px; color: #4285f4; cursor: pointer; display: inline-flex; align-items: center; font-size: 12px;';

  navButton.onclick = async e => {
    e.stopPropagation();
    try {
      const url = await handleClickGetUrl({
        firebaseUrl,
        collectionPath: req.collectionPath,
        isCollectionGroup: !!req.isCollectionGroup,
        filters: req.filters || [],
        orderBy: req.orderBy || [],
        limit: req.limit || null,
        type: req.type || null,
        aggregations: req.aggregations || [],
        documentId: req.documentId || null,
      });
      console.log(
        'uniqueKey: createPanelNavButton => url: ',
        JSON.stringify(url, null, 2)
      );
      if (url) window.open(url, '_blank');
    } catch (err) {
      console.log('[FireScope Pro] Failed to get URL:', err);
    }
  };

  return navButton;
}

export function createProcessorNavButton(url, queryInfo) {
  const navButton = document.createElement('button');
  navButton.className = 'nav-button';
  navButton.innerHTML =
    '<svg class="nav-icon" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H11V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V13H19V19Z"/></svg>';

  // Support both 'document_lookup' and 'doc_lookup' type names
  if (queryInfo.type === 'document_lookup' || queryInfo.type === 'doc_lookup') {
    // Create a small container of per-doc buttons
    const container = document.createElement('span');
    (queryInfo.documents || []).forEach(doc => {
      const btn = navButton.cloneNode(true);
      btn.title = `Open ${doc.collection}/${doc.id} in Firestore Console`;
      btn.onclick = async () => {
        try {
          const href = await handleClickGetUrl({
            firebaseUrl: url,
            collectionPath: doc.collection,
            type: 'document_lookup',
            documentId: doc.id,
          });
          if (href) window.open(href, '_blank');
        } catch (e) {
          console.log('[FireScope Pro] Failed to get URL:', e);
        }
      };
      container.appendChild(btn);
    });
    // If no doc buttons created, fall back to collection-level navigation
    if (container.childNodes.length === 0) {
      const btn = navButton.cloneNode(true);
      btn.title = `Open ${queryInfo.collectionPath || queryInfo.collection} in Firestore Console`;
      btn.onclick = async () => {
        try {
          const href = await handleClickGetUrl({
            firebaseUrl: url,
            collectionPath: queryInfo.collectionPath || queryInfo.collection,
            isCollectionGroup: !!queryInfo.isCollectionGroup,
            type: 'structured_query',
          });
          if (href) window.open(href, '_blank');
        } catch (e) {
          console.log('[FireScope Pro] Failed to get URL:', e);
        }
      };
      return btn;
    }
    return container;
  }

  navButton.title = `Open ${queryInfo.collectionPath || queryInfo.collection} in Firestore Console`;
  navButton.onclick = async () => {
    try {
      const href = await handleClickGetUrl({
        firebaseUrl: url,
        collectionPath: queryInfo.collectionPath || queryInfo.collection,
        isCollectionGroup: !!queryInfo.isCollectionGroup,
        filters: queryInfo.filters || [],
        orderBy: queryInfo.orderBy || [],
        limit: queryInfo.limit || null,
        type: queryInfo.type || null,
      });
      if (href) window.open(href, '_blank');
    } catch (e) {
      console.log('[FireScope Pro] Failed to get URL:', e);
    }
  };

  return navButton;
}
