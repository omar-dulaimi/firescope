import { describe, it, expect, beforeAll, vi } from 'vitest';
import { QueryExporter } from '../../src/js/query-exporter.js';

// Row shapes below are taken verbatim from what src/background.js hands to the
// panel, which spreads the payload straight onto the row it exports from.

const WEB_TARGETS = ['toReact', 'toNextClient', 'toAngular'];
const ADMIN_TARGETS = ['toNode', 'toNextServer'];
const ALL_TARGETS = [...WEB_TARGETS, ...ADMIN_TARGETS, 'toFlutter'];

const aggregationRow = {
  type: 'aggregation_query',
  collectionPath: 'orders',
  isCollectionGroup: false,
  filters: [
    { field: 'status', op: 'EQUAL', value: { stringValue: 'shipped' } },
  ],
  orderBy: [],
  aggregations: [
    { alias: 'count', count: {} },
    { alias: 'total', sum: { field: { fieldPath: 'amount' } } },
    { alias: 'mean', avg: { field: { fieldPath: 'amount' } } },
  ],
};

const docLookupRow = {
  type: 'doc_lookup',
  collectionPath: 'Users',
  isCollectionGroup: false,
  filters: [],
  orderBy: [],
  documents: [{ collection: 'Users', id: 'abc123' }],
};

const multiDocLookupRow = {
  type: 'document_lookup',
  documents: [
    { collection: 'Users', id: 'abc123' },
    { collection: 'Posts', id: 'Posts/xyz' },
  ],
};

describe('QueryExporter: aggregation queries stay server-side', () => {
  // A Firestore aggregation is billed per index entry scanned. Exporting it as
  // getDocs()/.get() would download every matching document instead, which is
  // billed per document and shows up on the user's Firebase invoice.
  it.each(ALL_TARGETS)('%s never emits a document read', target => {
    const code = QueryExporter[target](aggregationRow);
    expect(code).not.toMatch(/getDocs\s*\(/);
    expect(code).not.toMatch(/queryRef\.get\(\)/);
    expect(code).not.toMatch(/snap\.docs/);
  });

  it.each(WEB_TARGETS)('%s uses getAggregateFromServer', target => {
    const code = QueryExporter[target](aggregationRow);
    expect(code).toContain('getAggregateFromServer(qRef, {');
    expect(code).toContain('count: count()');
    expect(code).toContain("total: sum('amount')");
    expect(code).toContain("mean: average('amount')");
    // the aggregate helpers must be imported, or the snippet will not run
    expect(code).toMatch(
      /^import \{[^}]*getAggregateFromServer[^}]*\} from '(firebase\/firestore|@angular\/fire\/firestore)';$/m
    );
  });

  it.each(ADMIN_TARGETS)('%s uses .aggregate().get()', target => {
    const code = QueryExporter[target](aggregationRow);
    expect(code).toContain('queryRef.aggregate({');
    expect(code).toContain('count: admin.firestore.AggregateField.count()');
    expect(code).toContain(
      "total: admin.firestore.AggregateField.sum('amount')"
    );
    expect(code).toContain(
      "mean: admin.firestore.AggregateField.average('amount')"
    );
  });

  it('toFlutter uses the aggregate() query and its snapshot getters', () => {
    const code = QueryExporter.toFlutter(aggregationRow);
    expect(code).toContain(
      "queryRef.aggregate(count(), sum('amount'), average('amount')).get()"
    );
    expect(code).toContain('print(snap.count);');
    expect(code).toContain("print(snap.getSum('amount'));");
    expect(code).toContain("print(snap.getAverage('amount'));");
  });

  it('preserves the filters that scope the aggregation', () => {
    expect(QueryExporter.toReact(aggregationRow)).toContain(
      "where('status', '==', \"shipped\")"
    );
    expect(QueryExporter.toNode(aggregationRow)).toContain(
      "where('status', '==', \"shipped\")"
    );
  });

  it('falls back to COUNT rather than a document read when the aggregation list is missing', () => {
    const row = { ...aggregationRow, aggregations: [] };
    const code = QueryExporter.toReact(row);
    expect(code).not.toMatch(/getDocs\s*\(/);
    expect(code).toContain('count: count()');
    expect(code).toContain('defaulting to COUNT');
  });

  it('quotes aliases that are not valid identifiers', () => {
    const row = {
      ...aggregationRow,
      aggregations: [
        { alias: 'avg-basket', avg: { field: { fieldPath: 'x' } } },
      ],
    };
    expect(QueryExporter.toReact(row)).toContain("'avg-basket': average('x')");
  });
});

describe('QueryExporter: document lookups read the document, not the collection', () => {
  // A lookup is one read. Exporting it as a collection scan reads every document
  // in the collection, and the old exporter also dropped the document id entirely.
  it.each(ALL_TARGETS)('%s never emits a collection read', target => {
    const code = QueryExporter[target](docLookupRow);
    expect(code).not.toMatch(/getDocs\s*\(/);
    expect(code).not.toMatch(/collection\((db|firestore), 'Users'\)/);
    expect(code).not.toMatch(/db\.collection\('Users'\)/);
    expect(code).not.toMatch(/\.collection\('Users'\)/);
  });

  it.each(ALL_TARGETS)('%s targets the exact document path', target => {
    expect(QueryExporter[target](docLookupRow)).toContain("'Users/abc123'");
  });

  it.each(WEB_TARGETS)('%s uses getDoc', target => {
    const code = QueryExporter[target](docLookupRow);
    expect(code).toMatch(/getDoc\(doc\((db|firestore), 'Users\/abc123'\)\)/);
    expect(code).toMatch(/^import \{[^}]*doc, getDoc[^}]*\} from /m);
  });

  it.each(ADMIN_TARGETS)('%s uses db.doc().get()', target => {
    expect(QueryExporter[target](docLookupRow)).toContain(
      "db.doc('Users/abc123').get()"
    );
  });

  it('toFlutter uses instance.doc().get()', () => {
    expect(QueryExporter.toFlutter(docLookupRow)).toContain(
      "FirebaseFirestore.instance.doc('Users/abc123').get()"
    );
  });

  it('batches multiple documents without scanning a collection', () => {
    const react = QueryExporter.toReact(multiDocLookupRow);
    expect(react).toContain("doc(db, 'Users/abc123')");
    expect(react).toContain("doc(db, 'Posts/xyz')");
    expect(react).not.toMatch(/getDocs\s*\(/);

    const node = QueryExporter.toNode(multiDocLookupRow);
    expect(node).toContain('db.getAll(...refs)');
    expect(node).not.toMatch(/getDocs\s*\(/);
  });

  it('emits no query at all when the document path could not be recovered', () => {
    const row = { type: 'doc_lookup', collectionPath: 'Users', documents: [] };
    for (const target of ALL_TARGETS) {
      const code = QueryExporter[target](row);
      expect(code).not.toMatch(/getDocs\s*\(/);
      expect(code).not.toMatch(/\.get\(\)/);
      expect(code).toContain('could not recover the document path');
    }
  });
});

describe('QueryExporter: ordinary collection queries are unaffected', () => {
  const structuredRow = {
    type: 'structured_query',
    collectionPath: 'Users',
    isCollectionGroup: false,
    filters: [
      {
        field: 'age',
        op: 'GREATER_THAN_OR_EQUAL',
        value: { integerValue: '18' },
      },
    ],
    orderBy: [{ field: 'name', direction: 'ASCENDING' }],
  };

  it.each(['toReact', 'toNextClient', 'toAngular'])(
    '%s still fetches documents',
    target => {
      const code = QueryExporter[target](structuredRow);
      expect(code).toContain('getDocs(qRef)');
      expect(code).toContain("where('age', '>=', 18)");
      expect(code).toContain("orderBy('name', 'asc')");
    }
  );

  it.each(ADMIN_TARGETS)('%s still fetches documents', target => {
    const code = QueryExporter[target](structuredRow);
    expect(code).toContain('queryRef.get()');
    expect(code).toContain("where('age', '>=', 18)");
  });

  it('toFlutter still fetches documents', () => {
    const code = QueryExporter.toFlutter(structuredRow);
    expect(code).toContain('queryRef.get()');
    expect(code).toContain("where('age', isGreaterThanOrEqualTo: 18)");
  });

  it('collection group queries still use collectionGroup', () => {
    const row = { ...structuredRow, isCollectionGroup: true };
    expect(QueryExporter.toReact(row)).toContain(
      "collectionGroup(db, 'Users')"
    );
    expect(QueryExporter.toNode(row)).toContain("db.collectionGroup('Users')");
  });
});

describe('QueryExporter: a captured limit is never dropped', () => {
  // A `.limit(20)` is the difference between paying for 20 document reads and
  // paying for every document in the collection. Both are billed per document,
  // so an export that silently drops the limit hands the user an unbounded read.
  const limitedRow = {
    type: 'structured_query',
    collectionPath: 'Users',
    isCollectionGroup: false,
    filters: [{ field: 'active', op: 'EQUAL', value: { booleanValue: true } }],
    orderBy: [{ field: 'createdAt', direction: 'DESCENDING' }],
    limit: 20,
  };

  it.each(ALL_TARGETS)(
    '%s never exports a limited query as an unbounded read',
    target => {
      expect(QueryExporter[target](limitedRow)).toMatch(/limit\(20\)/);
    }
  );

  it.each(WEB_TARGETS)('%s imports the limit helper it calls', target => {
    const code = QueryExporter[target](limitedRow);
    expect(code).toContain('qRef = query(qRef, limit(20));');
    expect(code).toMatch(
      /^import \{[^}]*\blimit\b[^}]*\} from '(firebase\/firestore|@angular\/fire\/firestore)';$/m
    );
  });

  it.each([...ADMIN_TARGETS, 'toFlutter'])(
    '%s chains .limit() onto the query',
    target => {
      expect(QueryExporter[target](limitedRow)).toContain('.limit(20)');
    }
  );

  it.each(ALL_TARGETS)('%s applies the limit after orderBy', target => {
    const code = QueryExporter[target](limitedRow);
    expect(code.indexOf('limit(20)')).toBeGreaterThan(
      code.indexOf('createdAt')
    );
  });

  it.each(ALL_TARGETS)('%s states what the limit costs', target => {
    expect(QueryExporter[target](limitedRow)).toContain(
      'reads at most 20 documents'
    );
  });

  it.each(ALL_TARGETS)('%s keeps a limit of 1', target => {
    const code = QueryExporter[target]({ ...limitedRow, limit: 1 });
    expect(code).toMatch(/limit\(1\)/);
    expect(code).toContain('reads at most 1 document.');
  });

  it.each(ALL_TARGETS)('%s keeps the limit on a group query', target => {
    const code = QueryExporter[target]({
      ...limitedRow,
      isCollectionGroup: true,
    });
    expect(code).toMatch(/limit\(20\)/);
  });

  it.each(ALL_TARGETS)('%s invents no limit when none was captured', target => {
    const code = QueryExporter[target]({ ...limitedRow, limit: undefined });
    expect(code).not.toMatch(/limit\(/);
    expect(code).not.toContain('reads at most');
  });

  it.each(ALL_TARGETS)('%s ignores a limit that is not a count', target => {
    for (const bad of [null, 0, -5, NaN, 'abc', {}]) {
      const code = QueryExporter[target]({ ...limitedRow, limit: bad });
      expect(code).not.toMatch(/limit\(/);
    }
  });

  it.each(ALL_TARGETS)(
    '%s keeps a limited aggregation both server-side and bounded',
    target => {
      const code = QueryExporter[target]({ ...aggregationRow, limit: 5 });
      expect(code).toMatch(/limit\(5\)/);
      expect(code).not.toMatch(/getDocs\s*\(/);
      expect(code).not.toMatch(/queryRef\.get\(\)/);
      expect(code).not.toMatch(/snap\.docs/);
    }
  );
});

// ---------------------------------------------------------------------------
// From here on the parser in src/background.js is driven too, because a filter
// that never reaches the exporter cannot be exported. A dropped `where` turns a
// narrow query into a whole-collection scan, and Firestore bills collection reads
// per document returned, so this is the same class of defect as a dropped limit.
// ---------------------------------------------------------------------------

const FS_DOCS =
  'https://firestore.googleapis.com/v1/projects/demo-firescope/databases/(default)/documents';

// Every body below was produced by the real Firestore Web SDK (firebase 10.14.1)
// and copied verbatim off the wire: the SDK's HTTP layer was replaced with an
// undici MockAgent and getDocs()/getCount() were called against it. These are the
// shapes Firestore receives, not hand-written guesses. Note that the SDK unwraps a
// single-clause composite, so `where=fieldFilter` really does mean one clause.
const WIRE = {
  twoWheres: {
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'status' },
                op: 'EQUAL',
                value: { stringValue: 'shipped' },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'total' },
                op: 'GREATER_THAN_OR_EQUAL',
                value: { integerValue: '100' },
              },
            },
          ],
        },
      },
      orderBy: [
        { field: { fieldPath: 'total' }, direction: 'ASCENDING' },
        { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
      ],
    },
  },
  threeWheresLimited: {
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'status' },
                op: 'EQUAL',
                value: { stringValue: 'shipped' },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'total' },
                op: 'GREATER_THAN_OR_EQUAL',
                value: { integerValue: '100' },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'region' },
                op: 'IN',
                value: {
                  arrayValue: {
                    values: [{ stringValue: 'eu' }, { stringValue: 'us' }],
                  },
                },
              },
            },
          ],
        },
      },
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
      limit: 20,
    },
  },
  whereNull: {
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      where: {
        unaryFilter: { field: { fieldPath: 'deletedAt' }, op: 'IS_NULL' },
      },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    },
  },
  whereNaN: {
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      where: { unaryFilter: { field: { fieldPath: 'score' }, op: 'IS_NAN' } },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    },
  },
  orFilter: {
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      where: {
        compositeFilter: {
          op: 'OR',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'status' },
                op: 'EQUAL',
                value: { stringValue: 'shipped' },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'tier' },
                op: 'EQUAL',
                value: { stringValue: 'gold' },
              },
            },
          ],
        },
      },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    },
  },
  nestedAndOr: {
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'tenant' },
                op: 'EQUAL',
                value: { stringValue: 't1' },
              },
            },
            {
              compositeFilter: {
                op: 'OR',
                filters: [
                  {
                    fieldFilter: {
                      field: { fieldPath: 'status' },
                      op: 'EQUAL',
                      value: { stringValue: 'shipped' },
                    },
                  },
                  {
                    fieldFilter: {
                      field: { fieldPath: 'total' },
                      op: 'GREATER_THAN_OR_EQUAL',
                      value: { integerValue: '500' },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    },
  },
  singleWhere: {
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'status' },
          op: 'EQUAL',
          value: { stringValue: 'shipped' },
        },
      },
    },
  },
  limitedAggregation: {
    structuredAggregationQuery: {
      aggregations: [
        { alias: 'aggregate_0', count: {} },
        { alias: 'aggregate_1', sum: { field: { fieldPath: 'total' } } },
      ],
      structuredQuery: {
        from: [{ collectionId: 'orders' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'status' },
                  op: 'EQUAL',
                  value: { stringValue: 'shipped' },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'total' },
                  op: 'GREATER_THAN_OR_EQUAL',
                  value: { integerValue: '100' },
                },
              },
            ],
          },
        },
        limit: 50,
      },
    },
  },
};

/** The field paths a `where` tree really carries, in wire order. */
function wireFields(node, out = []) {
  if (!node) return out;
  if (node.fieldFilter) out.push(node.fieldFilter.field.fieldPath);
  else if (node.unaryFilter) out.push(node.unaryFilter.field.fieldPath);
  else if (node.compositeFilter)
    node.compositeFilter.filters.forEach(f => wireFields(f, out));
  return out;
}

function innerQuery(body) {
  return (
    body.structuredQuery || body.structuredAggregationQuery.structuredQuery
  );
}

// src/background.js is a service worker: it has no exports and registers its
// listeners on import. Stub what Chrome gives it, then replay a request through
// the listeners exactly as Chrome would, and read back what the panel receives.
let listeners = null;
async function backgroundListeners() {
  if (listeners) return listeners;
  const collected = { connect: [], request: [], completed: [] };
  globalThis.self = { addEventListener() {} };
  globalThis.chrome = {
    runtime: { onConnect: { addListener: fn => collected.connect.push(fn) } },
    webRequest: {
      onBeforeRequest: { addListener: fn => collected.request.push(fn) },
      onCompleted: { addListener: fn => collected.completed.push(fn) },
    },
  };
  await import('../../src/background.js');
  listeners = collected;
  return listeners;
}

let requestSeq = 0;

/**
 * Replay one Firestore request through the real background listeners and return
 * the rows the panel would export from.
 *
 * `body` goes down the raw JSON path used by `:runQuery` / `:runAggregationQuery`
 * one-shot reads; `formData` goes down the Listen/channel path used by
 * onSnapshot. Both end up in the same payload, which is the point.
 */
async function captureRows({ body, formData, url = `${FS_DOCS}:runQuery` }) {
  const l = await backgroundListeners();
  requestSeq += 1;
  const tabId = requestSeq;
  const requestId = `req-${requestSeq}`;
  const sent = [];
  const onMessage = [];
  const port = {
    name: 'firescope-panel',
    onMessage: { addListener: fn => onMessage.push(fn) },
    onDisconnect: { addListener() {} },
    postMessage: msg => sent.push(msg),
  };
  l.connect.forEach(fn => fn(port));
  onMessage.forEach(fn => fn({ type: 'init', tabId }));

  const requestBody = formData
    ? { formData }
    : {
        raw: [{ bytes: new TextEncoder().encode(JSON.stringify(body)).buffer }],
      };
  l.request.forEach(fn =>
    fn({ tabId, requestId, url, method: 'POST', requestBody })
  );
  l.completed.forEach(fn =>
    fn({ tabId, requestId, url, method: 'POST', statusCode: 200 })
  );
  return sent.filter(m => m.type === 'request').map(m => m.payload);
}

/** The same structuredQuery as the Listen/channel path delivers it. */
function asListenFormData(body) {
  const target = body.structuredAggregationQuery
    ? { structuredAggregationQuery: body.structuredAggregationQuery }
    : { structuredQuery: body.structuredQuery };
  return { req0___data__: JSON.stringify({ addTarget: { query: target } }) };
}

function whereCount(code) {
  return (code.match(/where\(/g) || []).length;
}

describe('captured filters survive to the export', () => {
  beforeAll(() => {
    // background.js logs every step; keep the test output readable.
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  const CASES = [
    ['twoWheres', WIRE.twoWheres],
    ['threeWheresLimited', WIRE.threeWheresLimited],
    ['whereNull', WIRE.whereNull],
    ['whereNaN', WIRE.whereNaN],
    ['orFilter', WIRE.orFilter],
    ['nestedAndOr', WIRE.nestedAndOr],
    ['singleWhere', WIRE.singleWhere],
    ['limitedAggregation', WIRE.limitedAggregation],
  ];

  it.each(CASES)(
    'the raw JSON body path reports every clause of %s',
    async (_name, body) => {
      const url = body.structuredAggregationQuery
        ? `${FS_DOCS}:runAggregationQuery`
        : `${FS_DOCS}:runQuery`;
      const rows = await captureRows({ body, url });
      expect(rows).toHaveLength(1);
      expect(rows[0].filters.map(f => f.field)).toEqual(
        wireFields(innerQuery(body).where)
      );
    }
  );

  it.each(CASES)(
    'the Listen/channel path agrees with the raw JSON body path for %s',
    async (_name, body) => {
      const url = body.structuredAggregationQuery
        ? `${FS_DOCS}:runAggregationQuery`
        : `${FS_DOCS}:runQuery`;
      const [viaJson] = await captureRows({ body, url });
      const [viaForm] = await captureRows({
        formData: asListenFormData(body),
        url: `${FS_DOCS.replace('/documents', '')}/google.firestore.v1.Firestore/Listen/channel`,
      });
      // One path growing a capability the other lacks is how this broke before.
      expect(viaForm.filters).toEqual(viaJson.filters);
      expect(viaForm.limit ?? null).toEqual(viaJson.limit ?? null);
    }
  );

  for (const [name, body] of CASES) {
    const fields = wireFields(innerQuery(body).where);
    it.each(ALL_TARGETS)(`%s exports every clause of ${name}`, async target => {
      const url = body.structuredAggregationQuery
        ? `${FS_DOCS}:runAggregationQuery`
        : `${FS_DOCS}:runQuery`;
      const [row] = await captureRows({ body, url });
      const code = QueryExporter[target](row);
      for (const field of fields) expect(code).toContain(`'${field}'`);
      // and no clause is quietly missing: one `where(...)` per captured clause
      expect(whereCount(code)).toBe(fields.length);
    });
  }

  it.each(ALL_TARGETS)(
    '%s never turns a two-clause query into an unfiltered collection read',
    async target => {
      const [row] = await captureRows({ body: WIRE.twoWheres });
      const code = QueryExporter[target](row);
      expect(whereCount(code)).toBe(2);
      expect(code).toContain("'status'");
      expect(code).toContain("'total'");
    }
  );

  it.each(ALL_TARGETS)(
    '%s keeps the clause of a `== null` query, which arrives as a unaryFilter',
    async target => {
      const [row] = await captureRows({ body: WIRE.whereNull });
      expect(QueryExporter[target](row)).toContain("'deletedAt'");
    }
  );

  it.each(ALL_TARGETS)(
    '%s keeps both branches of an or() query rather than dropping the filter',
    async target => {
      // The disjunction itself is not represented in the payload yet, so the
      // branches come back flattened. Exporting them is still far better than
      // exporting no filter at all and scanning the whole collection.
      const [row] = await captureRows({ body: WIRE.orFilter });
      const code = QueryExporter[target](row);
      expect(code).toContain("'status'");
      expect(code).toContain("'tier'");
    }
  );

  it.each(ALL_TARGETS)(
    "%s keeps an aggregation's own limit, which caps how much index is scanned",
    async target => {
      const [row] = await captureRows({
        body: WIRE.limitedAggregation,
        url: `${FS_DOCS}:runAggregationQuery`,
      });
      const code = QueryExporter[target](row);
      expect(code).toMatch(/limit\(50\)/);
      expect(code).not.toMatch(/getDocs\s*\(/);
      expect(code).not.toMatch(/snap\.docs/);
    }
  );

  it('reports a limit only when the request carried one', async () => {
    const [limited] = await captureRows({ body: WIRE.threeWheresLimited });
    expect(limited.limit).toBe(20);
    const [plain] = await captureRows({ body: WIRE.twoWheres });
    expect(plain.limit ?? null).toBeNull();
  });

  it('invents no clause for a filter it cannot name', async () => {
    const body = {
      structuredQuery: {
        from: [{ collectionId: 'orders' }],
        where: { unaryFilter: { op: 'IS_NULL' } },
      },
    };
    const [row] = await captureRows({ body });
    expect(row.filters).toEqual([]);
    expect(QueryExporter.toReact(row)).not.toContain('undefined');
  });
});
