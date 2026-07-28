// Early error handlers to satisfy Chrome expectations
/* global self */
self.addEventListener('error', () => {});
self.addEventListener('unhandledrejection', () => {});

const connections = new Map(); // tabId -> Port

chrome.runtime.onConnect.addListener(port => {
  console.log(
    '[FireScope Background] Connection received with name:',
    port.name
  );
  if (port.name !== 'firescope-panel') return;
  let tabId = null;

  port.onMessage.addListener(msg => {
    console.log('[FireScope Background] Message received from panel:', msg);
    if (msg.type === 'init') {
      tabId = msg.tabId;
      // Clean up any existing connection for this tab
      if (connections.has(tabId)) {
        console.log(
          '[FireScope Background] Replacing existing connection for tabId:',
          tabId
        );
      }
      connections.set(tabId, port);
      console.log(
        '[FireScope Background] Panel connected for tabId:',
        tabId,
        'Total connections:',
        connections.size
      );
    } else if (msg.type === 'ping') {
      // Respond to health check
      try {
        port.postMessage({ type: 'pong' });
        console.log(
          '[FireScope Background] Responded to ping from tabId:',
          tabId
        );
      } catch (error) {
        console.log(
          '[FireScope Background] Failed to respond to ping, connection may be stale:',
          error
        );
        if (tabId != null) {
          connections.delete(tabId);
        }
      }
    }
  });

  port.onDisconnect.addListener(() => {
    console.log(
      '[FireScope Background] Panel disconnected for tabId:',
      tabId,
      'Remaining connections:',
      connections.size - 1
    );
    if (tabId != null) {
      connections.delete(tabId);
      console.log(
        '[FireScope Background] Cleaned up connection for tabId:',
        tabId
      );
    }
  });
});

// -------- Parsing helpers --------

/**
 * Flatten a Firestore `structuredQuery.where` tree into the flat filter list the
 * panel renders and the exporters turn into `where(...)` clauses.
 *
 * Every request path must go through this one function. A `where` is only a bare
 * `fieldFilter` when the query has exactly one clause and that clause has a
 * comparable value: two or more clauses arrive as a `compositeFilter`, and
 * `== null` / `== NaN` arrive as a `unaryFilter`. A parser that understands only
 * `fieldFilter` reports no filters at all, and an export built from that reads the
 * whole collection. Firestore bills collection reads per document returned, so a
 * dropped filter is charged to the user.
 *
 * Nested composites are flattened, so the branches of an `or(...)` come back as
 * separate clauses. That loses the disjunction, which the payload has no shape for
 * yet; it is still strictly better than reporting no filters and exporting an
 * unfiltered scan.
 *
 * A `unaryFilter` without a `fieldPath` is skipped: there is no field name to
 * build a clause from, and inventing one would emit a query the request never made.
 */
function collectFilters(where) {
  const filters = [];
  const walk = node => {
    if (!node) return;
    if (node.fieldFilter) {
      filters.push({
        field: node.fieldFilter.field?.fieldPath,
        op: node.fieldFilter.op,
        value: node.fieldFilter.value,
      });
      return;
    }
    if (node.unaryFilter && node.unaryFilter.field) {
      filters.push({
        field: node.unaryFilter.field?.fieldPath,
        op: node.unaryFilter.op,
        value: null,
      });
      return;
    }
    if (node.compositeFilter && Array.isArray(node.compositeFilter.filters)) {
      node.compositeFilter.filters.forEach(walk);
    }
  };
  walk(where);
  return filters;
}

/**
 * The `limit` of a `structuredQuery`, in either wire form (a bare number, or
 * `{ value }`), or null when the request carried none.
 *
 * An aggregation carries one too, on its inner `structuredQuery`: it caps how much
 * of the index the server scans, so dropping it is the same class of cost defect as
 * dropping the limit of a document query.
 */
function readLimit(structuredQuery) {
  const raw = structuredQuery?.limit;
  if (typeof raw === 'number') return raw;
  if (raw && typeof raw.value === 'number') return raw.value;
  return null;
}

/**
 * A `startAt` / `endAt` cursor of a `structuredQuery`, or null when the request
 * carried none.
 *
 * A cursor bounds the slice of the ordered range the query reads. Dropping it
 * widens that read back to the whole range, and Firestore bills collection reads
 * per document returned, so a lost cursor costs the user the same way a lost
 * `limit` does. It has to be captured here, because a value that never reaches
 * the panel cannot be exported.
 *
 * `before` is proto3 JSON, which is allowed to omit a false boolean, and the
 * Admin SDK really does omit it. Absent therefore means false, not unknown --
 * and false is what distinguishes startAfter() from startAt().
 *
 * The values are kept in their wire form, exactly as filter values are, so that
 * each export target can render them in its own spelling.
 */
function readCursor(cursor) {
  const values = Array.isArray(cursor?.values) ? cursor.values : null;
  if (!values || values.length === 0) return null;
  return { before: cursor.before === true, values };
}

// Parse Listen/channel formData payloads
function parseFirestoreFromFormData(formData) {
  const results = [];
  if (!formData) return results;
  try {
    for (const [k, v] of Object.entries(formData)) {
      if (!/data__$/.test(k)) continue; // look only at reqN___data__ entries
      const payload = Array.isArray(v) ? v[0] : v;
      let obj;
      try {
        obj = typeof payload === 'string' ? JSON.parse(payload) : payload;
      } catch {
        continue;
      }

      // Document lookup
      if (obj?.addTarget?.documents) {
        const docsNode = obj.addTarget.documents;
        // Support both formats:
        // 1) addTarget.documents = [ "projects/.../documents/Col/docId" ]
        // 2) addTarget.documents = { documents: [ "projects/.../documents/Col/docId" ] }
        const list = Array.isArray(docsNode)
          ? docsNode
          : Array.isArray(docsNode.documents)
            ? docsNode.documents
            : [docsNode];

        for (const p of list) {
          const str = String(p);
          const idx = str.indexOf('/documents/');
          if (idx !== -1) {
            const tail = decodeURIComponent(
              str.slice(idx + '/documents/'.length)
            );
            const parts = tail.split('/');
            if (parts.length >= 2) {
              const docId = parts.pop();
              const collectionName = parts.pop();
              results.push({
                type: 'doc_lookup',
                collectionPath: collectionName,
                isCollectionGroup: false,
                filters: [],
                orderBy: [],
                documents: [{ collection: collectionName, id: docId }],
              });
            }
          }
        }
        continue;
      }

      // Structured query
      const sq =
        obj?.addTarget?.query?.structuredQuery ||
        obj?.addTarget?.structuredQuery;
      if (sq) {
        const from = Array.isArray(sq.from) && sq.from[0] ? sq.from[0] : {};
        const orderBy = Array.isArray(sq.orderBy)
          ? sq.orderBy.map(o => ({
              field: o.field?.fieldPath,
              dir: o.direction,
            }))
          : [];
        results.push({
          type: 'structured_query',
          collectionPath: from.collectionId || null,
          isCollectionGroup: !!from.allDescendants,
          filters: collectFilters(sq.where),
          orderBy,
          limit: readLimit(sq),
          startAt: readCursor(sq.startAt),
          endAt: readCursor(sq.endAt),
        });
        continue;
      }

      // Aggregation query
      const agg =
        obj?.addTarget?.query?.structuredAggregationQuery ||
        obj?.structuredAggregationQuery;
      if (agg?.structuredQuery) {
        const from = agg.structuredQuery.from?.[0] || {};

        results.push({
          type: 'aggregation_query',
          collectionPath: from.collectionId || null,
          isCollectionGroup: !!from.allDescendants,
          filters: collectFilters(agg.structuredQuery.where),
          orderBy: Array.isArray(agg.structuredQuery.orderBy)
            ? agg.structuredQuery.orderBy.map(o => ({
                field: o.field?.fieldPath,
                dir: o.direction,
              }))
            : [],
          limit: readLimit(agg.structuredQuery),
          startAt: readCursor(agg.structuredQuery.startAt),
          endAt: readCursor(agg.structuredQuery.endAt),
          aggregations: Array.isArray(agg.aggregations) ? agg.aggregations : [],
        });
        continue;
      }
    }
  } catch (_e) {
    // Silent error handling for form data parsing
  }
  return results;
}

// Fallback JSON/url parser
function parseFirestoreFromBody(bodyText, url) {
  const data = {
    method: 'POST',
    url,
    type: 'structured_query',
    collectionPath: null,
    isCollectionGroup: false,
    filters: [],
    orderBy: [],
    status: '',
    durationMs: null,
  };
  try {
    const json = JSON.parse(bodyText);
    if (json && json.structuredQuery) {
      const sq = json.structuredQuery;
      if (Array.isArray(sq.from) && sq.from[0]) {
        data.collectionPath = sq.from[0].collectionId || null;
        data.isCollectionGroup = !!sq.from[0].allDescendants;
      }
      if (Array.isArray(sq.orderBy)) {
        data.orderBy = sq.orderBy.map(o => ({
          field: o.field?.fieldPath,
          dir: o.direction,
        }));
      }
      data.limit = readLimit(sq);
      data.startAt = readCursor(sq.startAt);
      data.endAt = readCursor(sq.endAt);
      data.filters = collectFilters(sq.where);
    } else if (json && json.structuredAggregationQuery) {
      const agg = json.structuredAggregationQuery;
      data.type = 'aggregation_query';
      const from = agg.structuredQuery?.from?.[0] || {};
      data.collectionPath = from.collectionId || null;
      data.isCollectionGroup = !!from.allDescendants;
      data.filters = collectFilters(agg.structuredQuery?.where);
      data.limit = readLimit(agg.structuredQuery);
      data.startAt = readCursor(agg.structuredQuery?.startAt);
      data.endAt = readCursor(agg.structuredQuery?.endAt);
      data.orderBy = Array.isArray(agg.structuredQuery?.orderBy)
        ? agg.structuredQuery.orderBy.map(o => ({
            field: o.field?.fieldPath,
            dir: o.direction,
          }))
        : [];
      data.aggregations = Array.isArray(agg.aggregations)
        ? agg.aggregations
        : [];
    } else {
      const m = url.match(/\/documents\/(.*?)(?:\?|$)/);
      if (m) data.collectionPath = decodeURIComponent(m[1]);
    }
  } catch (_e) {
    const m = url.match(/\/documents\/(.*?)(?:\?|$)/);
    if (m) data.collectionPath = decodeURIComponent(m[1]);
  }
  return [data];
}

// Unified parse
function parseFirestore(details, bodyText) {
  const fromForm = parseFirestoreFromFormData(
    details.requestBody ? details.requestBody.formData : null
  );
  if (fromForm.length) return fromForm;
  return parseFirestoreFromBody(bodyText, details.url || '');
}

// -------- Timing & dispatch --------

const timings = new Map(); // requestId -> { ts, tabId, info }

chrome.webRequest.onBeforeRequest.addListener(
  details => {
    if (!details.tabId || details.tabId < 0) return;
    const url = details.url || '';
    if (!/firestore\.googleapis\.com/.test(url)) return;

    // Filter out GET requests (connection maintenance, no meaningful data)
    if (details.method === 'GET') return;

    let bodyText = '';
    if (details.requestBody) {
      if (details.requestBody.raw && details.requestBody.raw[0]) {
        try {
          bodyText = new TextDecoder('utf-8').decode(
            details.requestBody.raw[0].bytes
          );
        } catch (_e) {
          // Silent error handling for body text decoding
        }
      } else if (details.requestBody.formData) {
        // We still pass empty text; parsing will look into formData
        bodyText = '';
      }
    }
    const info = parseFirestore(details, bodyText);
    console.log('[FireScope Background] Parsed info:', info);

    // Filter out requests with no meaningful data (removeTarget, empty results)
    const validRequests = info
      .filter(req => {
        console.log('[FireScope Background] Checking request:', req);
        // Keep requests that have meaningful query data
        if (req.collectionPath && req.type === 'structured_query') {
          console.log(
            '[FireScope Background] Keeping structured_query:',
            req.collectionPath
          );
          return true;
        }
        if (req.type === 'doc_lookup' && req.collectionPath) {
          console.log(
            '[FireScope Background] Keeping doc_lookup:',
            req.collectionPath
          );
          return true;
        }
        if (req.type === 'aggregation_query' && req.collectionPath) {
          console.log(
            '[FireScope Background] Keeping aggregation_query:',
            req.collectionPath
          );
          return true;
        }
        console.log('[FireScope Background] Filtering out request:', req);
        return false;
      })
      .map(req => ({ ...req, url: details.url })); // Add URL to each valid request

    console.log(
      '[FireScope Background] Valid requests after filtering:',
      validRequests
    );

    // Only store if we have valid requests
    if (validRequests.length > 0) {
      timings.set(details.requestId, {
        ts: Date.now(),
        tabId: details.tabId,
        info: validRequests,
      });
      console.log(
        '[FireScope Background] Stored timing for requestId:',
        details.requestId
      );
    } else {
      console.log(
        '[FireScope Background] No valid requests to store for requestId:',
        details.requestId
      );
    }
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
);

chrome.webRequest.onCompleted.addListener(
  details => {
    console.log(
      '[FireScope Background] onCompleted for requestId:',
      details.requestId
    );
    const t = timings.get(details.requestId);
    if (!t) {
      console.log(
        '[FireScope Background] No stored timing info for requestId:',
        details.requestId
      );
      return; // No stored timing info (filtered out or GET request)
    }

    const endTs = Date.now();
    const duration = endTs - t.ts;
    const port = connections.get(t.tabId);
    console.log(
      '[FireScope Background] Found port for tabId:',
      t.tabId,
      port ? 'YES' : 'NO'
    );
    const payloads = Array.isArray(t.info) ? t.info : [t.info];
    payloads.forEach(p => {
      const payload = Object.assign({}, p, {
        status: details.statusCode,
        durationMs: duration,
        groupId: details.requestId,
        method: details.method,
        startedAt: t.ts,
        endedAt: endTs,
        groupTotal: payloads.length,
      });
      console.log('[FireScope Background] Sending payload to panel:', payload);
      if (port) {
        try {
          port.postMessage({ type: 'request', payload });
          console.log('[FireScope Background] Message sent successfully');
        } catch (error) {
          console.log(
            '[FireScope Background] Failed to send message, cleaning up stale connection:',
            error
          );
          connections.delete(t.tabId);
        }
      } else {
        console.log('[FireScope Background] No port found, message not sent');
      }
    });
    timings.delete(details.requestId);
  },
  { urls: ['<all_urls>'] }
);
