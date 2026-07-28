import { describe, it, expect } from 'vitest';
import { QueryExporter } from '../../src/js/query-exporter.js';

// Row shapes below are taken verbatim from what src/background.js and
// src/js/request-processor.js hand to the panel.

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
