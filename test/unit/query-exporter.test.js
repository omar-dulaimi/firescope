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
  whereNotNull: {
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      where: {
        unaryFilter: { field: { fieldPath: 'deletedAt' }, op: 'IS_NOT_NULL' },
      },
      orderBy: [
        { field: { fieldPath: 'deletedAt' }, direction: 'ASCENDING' },
        { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
      ],
    },
  },
  whereNaN: {
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      where: { unaryFilter: { field: { fieldPath: 'score' }, op: 'IS_NAN' } },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    },
  },
  whereNotNaN: {
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      where: {
        unaryFilter: { field: { fieldPath: 'score' }, op: 'IS_NOT_NAN' },
      },
      orderBy: [
        { field: { fieldPath: 'score' }, direction: 'ASCENDING' },
        { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
      ],
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

/**
 * The emitted code without its comment lines. A note explaining that a clause
 * could not be exported names the call it stands in for, so "no such call was
 * emitted" has to be asserted against the code rather than the whole snippet.
 */
function withoutComments(code) {
  return code
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n');
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
    ['whereNotNull', WIRE.whereNotNull],
    ['whereNaN', WIRE.whereNaN],
    ['whereNotNaN', WIRE.whereNotNaN],
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

// ---------------------------------------------------------------------------
// Unary operators.
//
// `== null` and `== NaN` do not travel as comparisons: Firestore turns them into
// a unaryFilter carrying IS_NULL / IS_NOT_NULL / IS_NAN / IS_NOT_NAN and no
// value. Passing that name straight to an exporter produced
// `where(f, 'IS_NULL', null)`, which no SDK accepts, so the user got an error
// instead of a query. The Flutter form was worse: `isEqualTo: null` is dropped
// by cloud_firestore rather than rejected, so the export silently became a
// whole-collection read.
//
// Every spelling asserted below was checked against the SDK that owns it:
// firebase 10.14.1 for Web/AngularFire, @google-cloud/firestore for Admin, and
// the cloud_firestore + firebase-android-sdk sources for Flutter.
// ---------------------------------------------------------------------------

describe('unary filters are translated, not passed through', () => {
  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  const UNARY_CASES = [
    ['whereNull', WIRE.whereNull, 'IS_NULL'],
    ['whereNotNull', WIRE.whereNotNull, 'IS_NOT_NULL'],
    ['whereNaN', WIRE.whereNaN, 'IS_NAN'],
    ['whereNotNaN', WIRE.whereNotNaN, 'IS_NOT_NAN'],
  ];

  for (const [_name, body, op] of UNARY_CASES) {
    it.each(ALL_TARGETS)(
      `%s never puts the wire operator ${op} in the exported query`,
      async target => {
        const [row] = await captureRows({ body });
        expect(row.filters[0].op).toBe(op);
        expect(QueryExporter[target](row)).not.toContain(op);
      }
    );
  }

  it.each([...WEB_TARGETS, ...ADMIN_TARGETS])(
    '%s compares against null for IS_NULL and IS_NOT_NULL',
    async target => {
      const [isNull] = await captureRows({ body: WIRE.whereNull });
      expect(QueryExporter[target](isNull)).toContain(
        "where('deletedAt', '==', null)"
      );
      const [isNotNull] = await captureRows({ body: WIRE.whereNotNull });
      expect(QueryExporter[target](isNotNull)).toContain(
        "where('deletedAt', '!=', null)"
      );
    }
  );

  it.each([...WEB_TARGETS, ...ADMIN_TARGETS])(
    '%s compares against NaN for IS_NAN and IS_NOT_NAN',
    async target => {
      const [isNaN_] = await captureRows({ body: WIRE.whereNaN });
      const code = QueryExporter[target](isNaN_);
      expect(code).toContain("where('score', '==', NaN)");
      // JSON.stringify(NaN) is 'null', which silently compared against null.
      expect(code).not.toContain("where('score', '==', null)");
      const [isNotNaN] = await captureRows({ body: WIRE.whereNotNaN });
      expect(QueryExporter[target](isNotNaN)).toContain(
        "where('score', '!=', NaN)"
      );
    }
  );

  it('toFlutter uses isNull, because isEqualTo: null is dropped by cloud_firestore', async () => {
    const [isNull] = await captureRows({ body: WIRE.whereNull });
    const code = QueryExporter.toFlutter(isNull);
    expect(code).toContain(".where('deletedAt', isNull: true)");
    // A null isEqualTo fails the `!= null` guard in Query.where and never
    // reaches Firestore, which turns this export into an unfiltered scan.
    expect(code).not.toContain('isEqualTo: null');

    const [isNotNull] = await captureRows({ body: WIRE.whereNotNull });
    const notNullCode = QueryExporter.toFlutter(isNotNull);
    expect(notNullCode).toContain(".where('deletedAt', isNull: false)");
    expect(notNullCode).not.toContain('isNotEqualTo: null');
  });

  it('toFlutter compares against double.nan for the NaN operators', async () => {
    const [isNaN_] = await captureRows({ body: WIRE.whereNaN });
    expect(QueryExporter.toFlutter(isNaN_)).toContain(
      ".where('score', isEqualTo: double.nan)"
    );
    const [isNotNaN] = await captureRows({ body: WIRE.whereNotNaN });
    expect(QueryExporter.toFlutter(isNotNaN)).toContain(
      ".where('score', isNotEqualTo: double.nan)"
    );
  });

  it.each(ALL_TARGETS)(
    '%s reports an operator it cannot spell instead of emitting it',
    target => {
      const row = {
        type: 'structured_query',
        collectionPath: 'orders',
        filters: [{ field: 'weird', op: 'SOMETHING_NEW', value: null }],
        orderBy: [],
      };
      const code = QueryExporter[target](row);
      expect(code).not.toContain("'SOMETHING_NEW'");
      expect(withoutComments(code)).not.toMatch(/where\(/);
      expect(code).toContain('SOMETHING_NEW filter on weird');
      expect(code).toContain('reads MORE documents than the app did');
    }
  );

  it.each(ALL_TARGETS)('%s still spells ordinary operators', target => {
    const row = {
      type: 'structured_query',
      collectionPath: 'orders',
      filters: [
        { field: 'age', op: 'GREATER_THAN', value: { integerValue: '18' } },
      ],
      orderBy: [],
    };
    expect(QueryExporter[target](row)).toMatch(/where\('age',/);
  });
});

// ---------------------------------------------------------------------------
// Cursors.
//
// startAt/endAt bound the slice of the ordered range a query reads. Nothing
// captured them, so every export read the whole range instead: the same class of
// cost defect as the dropped limit, because Firestore bills collection reads per
// document returned.
//
// The four wire shapes below came off the real Web SDK, not from a guess:
//   startAt(v)    -> startAt: { before: true,  values }
//   startAfter(v) -> startAt: { before: false, values }
//   endAt(v)      -> endAt:   { before: false, values }
//   endBefore(v)  -> endAt:   { before: true,  values }
// ---------------------------------------------------------------------------

const ORDER_TOTAL_THEN_KEY = [
  { field: { fieldPath: 'total' }, direction: 'ASCENDING' },
  { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
];

const CURSOR_WIRE = {
  startAfterAndLimit: {
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      orderBy: ORDER_TOTAL_THEN_KEY,
      limit: 20,
      startAt: { before: false, values: [{ integerValue: '100' }] },
    },
  },
  startAtAndEndBefore: {
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      orderBy: ORDER_TOTAL_THEN_KEY,
      startAt: { before: true, values: [{ integerValue: '100' }] },
      endAt: { before: true, values: [{ integerValue: '500' }] },
    },
  },
  endAtWithoutBefore: {
    // proto3 JSON omits a false boolean and the Admin SDK really does omit it,
    // so an absent `before` has to read as endAt(), never as endBefore().
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      orderBy: ORDER_TOTAL_THEN_KEY,
      endAt: { values: [{ integerValue: '500' }] },
    },
  },
  paginationCursor: {
    // What startAfter(lastDocumentSnapshot) puts on the wire: one value per
    // orderBy clause, ending on the __name__ ordering Firestore appends.
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      orderBy: ORDER_TOTAL_THEN_KEY,
      startAt: {
        before: false,
        values: [
          { integerValue: '100' },
          {
            referenceValue:
              'projects/demo-firescope/databases/(default)/documents/orders/abc',
          },
        ],
      },
    },
  },
  groupPaginationCursor: {
    structuredQuery: {
      from: [{ collectionId: 'orders', allDescendants: true }],
      orderBy: ORDER_TOTAL_THEN_KEY,
      startAt: {
        before: false,
        values: [
          { integerValue: '100' },
          {
            referenceValue:
              'projects/demo-firescope/databases/(default)/documents/users/u1/orders/abc',
          },
        ],
      },
    },
  },
  timestampCursor: {
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      orderBy: [
        { field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' },
        { field: { fieldPath: '__name__' }, direction: 'DESCENDING' },
      ],
      startAt: {
        before: false,
        values: [{ timestampValue: '2023-11-14T22:13:20.123456000Z' }],
      },
    },
  },
  unrepresentableCursor: {
    // A bytes cursor has no literal FireScope can prove in these SDKs.
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      orderBy: [{ field: { fieldPath: 'blob' }, direction: 'ASCENDING' }],
      startAt: { before: true, values: [{ bytesValue: 'AQID' }] },
    },
  },
  aggregationWithCursor: {
    structuredAggregationQuery: {
      aggregations: [{ alias: 'aggregate_0', count: {} }],
      structuredQuery: {
        from: [{ collectionId: 'orders' }],
        orderBy: ORDER_TOTAL_THEN_KEY,
        startAt: { before: false, values: [{ integerValue: '100' }] },
      },
    },
  },
};

describe('a captured cursor is never dropped', () => {
  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('the parser reports both cursors, with before normalised', async () => {
    const [both] = await captureRows({ body: CURSOR_WIRE.startAtAndEndBefore });
    expect(both.startAt).toEqual({
      before: true,
      values: [{ integerValue: '100' }],
    });
    expect(both.endAt).toEqual({
      before: true,
      values: [{ integerValue: '500' }],
    });

    const [omitted] = await captureRows({
      body: CURSOR_WIRE.endAtWithoutBefore,
    });
    expect(omitted.endAt).toEqual({
      before: false,
      values: [{ integerValue: '500' }],
    });
  });

  it('reports a cursor only when the request carried one', async () => {
    const [plain] = await captureRows({ body: WIRE.twoWheres });
    expect(plain.startAt ?? null).toBeNull();
    expect(plain.endAt ?? null).toBeNull();
  });

  it('the Listen/channel path agrees with the raw JSON body path', async () => {
    for (const body of Object.values(CURSOR_WIRE)) {
      const url = body.structuredAggregationQuery
        ? `${FS_DOCS}:runAggregationQuery`
        : `${FS_DOCS}:runQuery`;
      const [viaJson] = await captureRows({ body, url });
      const [viaForm] = await captureRows({
        formData: asListenFormData(body),
        url: `${FS_DOCS.replace('/documents', '')}/google.firestore.v1.Firestore/Listen/channel`,
      });
      expect(viaForm.startAt ?? null).toEqual(viaJson.startAt ?? null);
      expect(viaForm.endAt ?? null).toEqual(viaJson.endAt ?? null);
    }
  });

  it.each(ALL_TARGETS)(
    '%s exports startAfter() for a startAt cursor with before false',
    async target => {
      const [row] = await captureRows({ body: CURSOR_WIRE.startAfterAndLimit });
      const code = QueryExporter[target](row);
      expect(code).toMatch(/startAfter\(\[?100\]?\)/);
      expect(code).not.toMatch(/\bstartAt\(/);
    }
  );

  it.each(ALL_TARGETS)(
    '%s exports startAt() and endBefore() when before is true',
    async target => {
      const [row] = await captureRows({
        body: CURSOR_WIRE.startAtAndEndBefore,
      });
      const code = QueryExporter[target](row);
      expect(code).toMatch(/startAt\(\[?100\]?\)/);
      expect(code).toMatch(/endBefore\(\[?500\]?\)/);
      expect(code).not.toMatch(/startAfter\(/);
      expect(code).not.toMatch(/\bendAt\(/);
    }
  );

  it.each(ALL_TARGETS)(
    '%s reads an omitted before as endAt(), not endBefore()',
    async target => {
      const [row] = await captureRows({ body: CURSOR_WIRE.endAtWithoutBefore });
      const code = QueryExporter[target](row);
      expect(code).toMatch(/endAt\(\[?500\]?\)/);
      expect(code).not.toMatch(/endBefore\(/);
    }
  );

  it.each(ALL_TARGETS)(
    '%s keeps the cursor and the limit together',
    async target => {
      const [row] = await captureRows({ body: CURSOR_WIRE.startAfterAndLimit });
      const code = QueryExporter[target](row);
      expect(code).toMatch(/startAfter\(/);
      expect(code).toMatch(/limit\(20\)/);
    }
  );

  it.each(WEB_TARGETS)(
    '%s imports the cursor helper it calls',
    async target => {
      const [row] = await captureRows({
        body: CURSOR_WIRE.startAtAndEndBefore,
      });
      const code = QueryExporter[target](row);
      expect(code).toMatch(
        /^import \{[^}]*\bstartAt\b[^}]*\} from '(firebase\/firestore|@angular\/fire\/firestore)';$/m
      );
      expect(code).toMatch(
        /^import \{[^}]*\bendBefore\b[^}]*\} from '(firebase\/firestore|@angular\/fire\/firestore)';$/m
      );
    }
  );

  it.each(WEB_TARGETS)(
    '%s imports every helper the emitted snippet calls',
    async target => {
      const [row] = await captureRows({ body: CURSOR_WIRE.timestampCursor });
      const code = QueryExporter[target](row);
      const imported = code
        .match(/^import \{([^}]*)\} from '[^']*';$/m)[1]
        .split(',')
        .map(s => s.trim());
      const body = code
        .split('\n')
        .filter(l => !l.startsWith('import ') && !l.startsWith('//'))
        .join('\n');
      // Bare `name(` calls only: `.data()` and `.map()` are method calls.
      const called = new Set(
        [...body.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1])
      );
      for (const name of called) expect(imported).toContain(name);
    }
  );

  it.each(WEB_TARGETS)(
    '%s rebuilds a timestamp cursor exactly, not through a millisecond Date',
    async target => {
      const [row] = await captureRows({ body: CURSOR_WIRE.timestampCursor });
      expect(QueryExporter[target](row)).toContain(
        'startAfter(new Timestamp(1700000000, 123456000))'
      );
    }
  );

  it.each(ADMIN_TARGETS)(
    '%s rebuilds a timestamp cursor exactly',
    async target => {
      const [row] = await captureRows({ body: CURSOR_WIRE.timestampCursor });
      expect(QueryExporter[target](row)).toContain(
        '.startAfter(new admin.firestore.Timestamp(1700000000, 123456000))'
      );
    }
  );

  it('toFlutter rebuilds a timestamp cursor exactly', async () => {
    const [row] = await captureRows({ body: CURSOR_WIRE.timestampCursor });
    expect(QueryExporter.toFlutter(row)).toContain(
      '.startAfter([Timestamp(1700000000, 123456000)])'
    );
  });

  it.each(ALL_TARGETS)(
    '%s spells a __name__ cursor as a document id, which is what the SDKs accept',
    async target => {
      const [row] = await captureRows({ body: CURSOR_WIRE.paginationCursor });
      const code = QueryExporter[target](row);
      // The Web SDK rejects a DocumentReference at a documentId() ordering and
      // rejects a path containing a slash for a collection query.
      expect(code).toContain('"abc"');
      expect(code).not.toContain('orders/abc');
    }
  );

  it.each(ALL_TARGETS)(
    '%s spells a __name__ cursor on a collection group as a full path',
    async target => {
      const [row] = await captureRows({
        body: CURSOR_WIRE.groupPaginationCursor,
      });
      expect(QueryExporter[target](row)).toContain('"users/u1/orders/abc"');
    }
  );

  it.each(ALL_TARGETS)(
    '%s wraps the cursor values the way the target expects',
    async target => {
      const [row] = await captureRows({ body: CURSOR_WIRE.paginationCursor });
      const code = QueryExporter[target](row);
      expect(code).toContain(
        target === 'toFlutter'
          ? 'startAfter([100, "abc"])'
          : 'startAfter(100, "abc")'
      );
    }
  );

  it.each(ALL_TARGETS)(
    '%s says the range widened rather than emitting a cursor it cannot spell',
    async target => {
      const [row] = await captureRows({
        body: CURSOR_WIRE.unrepresentableCursor,
      });
      const code = QueryExporter[target](row);
      expect(withoutComments(code)).not.toMatch(/startAt\(/);
      expect(code).toContain('startAt() cursor whose value has no faithful');
      expect(code).toContain('WIDER range than the app did');
    }
  );

  it.each(ALL_TARGETS)(
    "%s keeps an aggregation's cursor and stays server-side",
    async target => {
      const [row] = await captureRows({
        body: CURSOR_WIRE.aggregationWithCursor,
        url: `${FS_DOCS}:runAggregationQuery`,
      });
      const code = QueryExporter[target](row);
      expect(code).toMatch(/startAfter\(\[?100\]?\)/);
      expect(code).not.toMatch(/getDocs\s*\(/);
      expect(code).not.toMatch(/snap\.docs/);
    }
  );

  it.each(ALL_TARGETS)(
    '%s invents no cursor when none was captured',
    target => {
      const code = QueryExporter[target]({
        type: 'structured_query',
        collectionPath: 'orders',
        filters: [],
        orderBy: [{ field: 'total', direction: 'ASCENDING' }],
      });
      for (const fn of ['startAt', 'startAfter', 'endAt', 'endBefore']) {
        expect(code).not.toContain(`${fn}(`);
      }
    }
  );

  it.each(ALL_TARGETS)('%s ignores a cursor with no values', target => {
    for (const bad of [{}, { values: [] }, { before: true }, null, 'nope']) {
      const code = QueryExporter[target]({
        type: 'structured_query',
        collectionPath: 'orders',
        filters: [],
        orderBy: [{ field: 'total', direction: 'ASCENDING' }],
        startAt: bad,
      });
      expect(code).not.toContain('startAt(');
      expect(code).not.toContain('startAfter(');
    }
  });
});

describe('a clause with nothing to filter on is never invented', () => {
  it.each(ALL_TARGETS)(
    '%s emits no where() for a filter with no field name',
    target => {
      const code = QueryExporter[target]({
        type: 'structured_query',
        collectionPath: 'orders',
        filters: [{ op: 'IS_NULL', value: null }],
        orderBy: [],
      });
      expect(code).not.toContain('undefined');
      expect(withoutComments(code)).not.toMatch(/where\(/);
    }
  );
});
