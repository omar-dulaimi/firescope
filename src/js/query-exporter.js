function toSymbolOp(op) {
  const map = {
    EQUAL: '==',
    NOT_EQUAL: '!=',
    LESS_THAN: '<',
    LESS_THAN_OR_EQUAL: '<=',
    GREATER_THAN: '>',
    GREATER_THAN_OR_EQUAL: '>=',
    IN: 'in',
    NOT_IN: 'not-in',
    ARRAY_CONTAINS: 'array-contains',
    ARRAY_CONTAINS_ANY: 'array-contains-any',
  };
  return map[op] || op || '==';
}

function toFlutterParam(op) {
  const map = {
    '==': 'isEqualTo',
    '!=': 'isNotEqualTo',
    '<': 'isLessThan',
    '<=': 'isLessThanOrEqualTo',
    '>': 'isGreaterThan',
    '>=': 'isGreaterThanOrEqualTo',
    in: 'whereIn',
    'not-in': 'whereNotIn',
    'array-contains': 'arrayContains',
    'array-contains-any': 'arrayContainsAny',
  };
  return map[op] || 'isEqualTo';
}

function normalizeValue(v) {
  if (typeof v !== 'object' || v === null) return v;
  const valueType = Object.keys(v)[0];
  if (!valueType) return v;
  const value = v[valueType];
  switch (valueType) {
    case 'stringValue':
      return value;
    case 'integerValue':
      return parseInt(value);
    case 'doubleValue':
      return parseFloat(value);
    case 'booleanValue':
      return value;
    case 'nullValue':
      return null;
    case 'timestampValue':
      return value;
    case 'arrayValue':
      return value?.values ? value.values.map(normalizeValue) : [];
    case 'mapValue':
      return value?.fields || {};
    default:
      return v;
  }
}

function dartify(value) {
  // Basic JSON -> Dart literal; booleans/numbers fine; strings quoted; arrays/maps JSON-like are acceptable for examples
  return JSON.stringify(value);
}

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Single-quoted string literal. Valid in JS/TS and in Dart.
 */
function sq(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function objKey(alias) {
  return IDENT_RE.test(alias) ? alias : sq(alias);
}

/**
 * A row is an aggregation when Firestore answered it server-side (COUNT/SUM/AVG).
 * These bill per index entry scanned, not per document returned, so the exported
 * code must aggregate server-side too.
 */
export function isAggregationQuery(q) {
  return (
    q?.type === 'aggregation_query' ||
    (Array.isArray(q?.aggregations) && q.aggregations.length > 0)
  );
}

/**
 * A row is a document lookup when the app asked for specific document paths.
 * These bill one read per document, so the exported code must read those exact
 * documents rather than scanning the parent collection.
 */
export function isDocumentLookup(q) {
  return q?.type === 'doc_lookup' || q?.type === 'document_lookup';
}

/**
 * Normalize captured documents into full Firestore document paths.
 * Parsers hand back either { collection, id } or an `id` that is already a path.
 * Anything that is not a valid (even segment count) document path is dropped.
 */
function getLookupDocPaths(q) {
  const docs = Array.isArray(q?.documents) ? q.documents : [];
  return docs
    .map(d => {
      const id = d?.id == null ? '' : String(d.id);
      if (!id) return null;
      const collection = d?.collection == null ? '' : String(d.collection);
      const raw = id.includes('/') ? id : `${collection}/${id}`;
      const segments = raw.split('/').filter(Boolean);
      if (segments.length === 0 || segments.length % 2 !== 0) return null;
      return segments.join('/');
    })
    .filter(Boolean);
}

/**
 * Normalize the captured aggregation list into { alias, op, field } entries.
 * Aliases are made unique so they can be used as result keys.
 */
function getAggregations(q) {
  const raw = Array.isArray(q?.aggregations) ? q.aggregations : [];
  const used = new Set();
  const out = [];

  raw.forEach(a => {
    let op = null;
    let field = null;
    if (a?.count !== undefined) {
      op = 'count';
    } else if (a?.sum) {
      op = 'sum';
      field = a.sum.field?.fieldPath || a.sum.field || null;
    } else if (a?.avg) {
      op = 'avg';
      field = a.avg.field?.fieldPath || a.avg.field || null;
    }
    if (!op) return;
    if ((op === 'sum' || op === 'avg') && !field) return;

    const base = String(
      a?.alias || (op === 'count' ? 'count' : `${op}_${field}`)
    );
    let alias = base;
    let n = 2;
    while (used.has(alias)) alias = `${base}_${n++}`;
    used.add(alias);

    out.push({ alias, op, field });
  });

  return out;
}

/**
 * Aggregations to emit, plus whether we had to fall back to a plain COUNT because
 * FireScope did not capture the aggregation list for this request.
 */
function resolveAggregations(q) {
  const aggregations = getAggregations(q);
  if (aggregations.length) return { aggregations, defaulted: false };
  return {
    aggregations: [{ alias: 'count', op: 'count', field: null }],
    defaulted: true,
  };
}

const NO_DOC_PATHS_NOTE =
  '// FireScope captured a document lookup but could not recover the document path.\n' +
  '// No query is emitted here on purpose: reading the whole collection would cost\n' +
  '// far more than the single-document read this request actually performed.';

/**
 * Web SDK (modular) filter/orderBy lines, operating on a `qRef` variable.
 */
function webQueryLines(q) {
  let code = '';
  (q.filters || []).forEach(f => {
    const op = toSymbolOp(f.op);
    const val = normalizeValue(f.value);
    code += `qRef = query(qRef, where('${f.field}', '${op}', ${JSON.stringify(val)}));\n`;
  });
  (q.orderBy || []).forEach(o => {
    const dir = (o.direction || o.dir || '').toLowerCase().startsWith('desc')
      ? "'desc'"
      : "'asc'";
    code += `qRef = query(qRef, orderBy('${o.field}', ${dir}));\n`;
  });
  return code;
}

/**
 * Admin SDK filter/orderBy chain segments.
 */
function adminQueryChain(q) {
  const chain = [];
  (q.filters || []).forEach(f => {
    const op = toSymbolOp(f.op);
    const val = normalizeValue(f.value);
    chain.push(`.where('${f.field}', '${op}', ${JSON.stringify(val)})`);
  });
  (q.orderBy || []).forEach(o => {
    const dir = (o.direction || o.dir || '').toLowerCase().startsWith('desc')
      ? "'desc'"
      : "'asc'";
    chain.push(`.orderBy('${o.field}', ${dir})`);
  });
  return chain;
}

const WEB_AGG_FN = { count: 'count', sum: 'sum', avg: 'average' };

function webAggregateSpec(aggregations) {
  const entries = aggregations.map(a => {
    const fn = WEB_AGG_FN[a.op];
    const args = a.op === 'count' ? '' : sq(a.field);
    return `  ${objKey(a.alias)}: ${fn}(${args}),`;
  });
  return `{\n${entries.join('\n')}\n}`;
}

function adminAggregateSpec(aggregations) {
  const entries = aggregations.map(a => {
    const fn = a.op === 'avg' ? 'average' : a.op;
    const args = a.op === 'count' ? '' : sq(a.field);
    return `  ${objKey(a.alias)}: admin.firestore.AggregateField.${fn}(${args}),`;
  });
  return `{\n${entries.join('\n')}\n}`;
}

/**
 * Build a Web SDK (modular) aggregation export. Shared by React, Next client and
 * Angular, which differ only in the import source and the Firestore variable name.
 */
function webAggregationExport(
  q,
  { header, importFrom, dbVar, extraImports = [] }
) {
  const path = q.collectionPath || q.collection || 'UNKNOWN';
  const isGroup = !!q.isCollectionGroup;
  const { aggregations, defaulted } = resolveAggregations(q);

  const aggImports = [...new Set(aggregations.map(a => WEB_AGG_FN[a.op]))];
  const imports = [
    ...extraImports,
    isGroup ? 'collectionGroup' : 'collection',
    'query',
    'where',
    'orderBy',
    'getAggregateFromServer',
    ...aggImports,
  ].join(', ');

  let code = `${header}\n`;
  code += `import { ${imports} } from '${importFrom}';\n\n`;
  if (defaulted) {
    code += `// FireScope did not capture the aggregation list for this request; defaulting to COUNT.\n`;
  }
  code += `const ref = ${isGroup ? `collectionGroup(${dbVar}, '${path}')` : `collection(${dbVar}, '${path}')`};\n`;
  code += `let qRef = ref;\n`;
  code += webQueryLines(q);
  code += `// Server-side aggregation: billed per index entry scanned, not per document.\n`;
  code += `const snap = await getAggregateFromServer(qRef, ${webAggregateSpec(aggregations)});\n`;
  code += `console.log(snap.data());`;
  return code;
}

/**
 * Build a Web SDK (modular) document lookup export.
 */
function webDocumentLookupExport(
  q,
  { header, importFrom, dbVar, extraImports = [] }
) {
  const paths = getLookupDocPaths(q);
  if (!paths.length) return `${header}\n${NO_DOC_PATHS_NOTE}`;

  const imports = [...extraImports, 'doc', 'getDoc'].join(', ');
  let code = `${header}\n`;
  code += `import { ${imports} } from '${importFrom}';\n\n`;

  if (paths.length === 1) {
    code += `// Reads exactly this document (1 read), not the parent collection.\n`;
    code += `const snap = await getDoc(doc(${dbVar}, ${sq(paths[0])}));\n`;
    code += `console.log(snap.exists() ? { id: snap.id, ...snap.data() } : null);`;
    return code;
  }

  code += `// Reads exactly these documents (${paths.length} reads), not the parent collections.\n`;
  code += `const refs = [\n${paths.map(p => `  doc(${dbVar}, ${sq(p)}),`).join('\n')}\n];\n`;
  code += `const snaps = await Promise.all(refs.map(r => getDoc(r)));\n`;
  code += `console.log(snaps.map(s => (s.exists() ? { id: s.id, ...s.data() } : null)));`;
  return code;
}

/**
 * Build an Admin SDK aggregation export. Shared by Node and Next server.
 */
function adminAggregationExport(q, { header }) {
  const path = q.collectionPath || q.collection || 'UNKNOWN';
  const isGroup = !!q.isCollectionGroup;
  const { aggregations, defaulted } = resolveAggregations(q);
  const chain = adminQueryChain(q);

  let code = `${header}\n`;
  if (defaulted) {
    code += `// FireScope did not capture the aggregation list for this request; defaulting to COUNT.\n`;
  }
  code += `const db = admin.firestore();\n`;
  code += `let ref = ${isGroup ? `db.collectionGroup('${path}')` : `db.collection('${path}')`};\n`;
  code += `const queryRef = ref${chain.length ? '\n  ' + chain.join('\n  ') : ''};\n`;
  code += `// Server-side aggregation: billed per index entry scanned, not per document.\n`;
  code += `const snap = await queryRef.aggregate(${adminAggregateSpec(aggregations)}).get();\n`;
  code += `console.log(snap.data());`;
  return code;
}

/**
 * Build an Admin SDK document lookup export. Shared by Node and Next server.
 */
function adminDocumentLookupExport(q, { header }) {
  const paths = getLookupDocPaths(q);
  if (!paths.length) return `${header}\n${NO_DOC_PATHS_NOTE}`;

  let code = `${header}\n`;
  code += `const db = admin.firestore();\n`;

  if (paths.length === 1) {
    code += `// Reads exactly this document (1 read), not the parent collection.\n`;
    code += `const snap = await db.doc(${sq(paths[0])}).get();\n`;
    code += `console.log(snap.exists ? { id: snap.id, ...snap.data() } : null);`;
    return code;
  }

  code += `// Reads exactly these documents (${paths.length} reads), not the parent collections.\n`;
  code += `const refs = [\n${paths.map(p => `  db.doc(${sq(p)}),`).join('\n')}\n];\n`;
  code += `const snaps = await db.getAll(...refs);\n`;
  code += `console.log(snaps.map(s => (s.exists ? { id: s.id, ...s.data() } : null)));`;
  return code;
}

export const QueryExporter = {
  toAngular(q) {
    const angular = {
      importFrom: '@angular/fire/firestore',
      dbVar: 'firestore',
      extraImports: ['Firestore'],
    };
    if (isDocumentLookup(q)) {
      return webDocumentLookupExport(q, {
        ...angular,
        header: '// AngularFire example (document lookup)',
      });
    }
    if (isAggregationQuery(q)) {
      return webAggregationExport(q, {
        ...angular,
        header: '// AngularFire example (aggregation query)',
      });
    }

    const path = q.collectionPath || q.collection || 'UNKNOWN';
    const isGroup = !!q.isCollectionGroup;
    let code = `// AngularFire example\n`;
    code += `import { Firestore, ${isGroup ? 'collectionGroup, ' : ''}collection, query, where, orderBy, getDocs } from '@angular/fire/firestore';\n\n`;
    code += `const ref = ${isGroup ? `collectionGroup(firestore, '${path}')` : `collection(firestore, '${path}')`};\n`;
    code += `let qRef = ref;\n`;
    (q.filters || []).forEach(f => {
      const op = toSymbolOp(f.op);
      const val = normalizeValue(f.value);
      code += `qRef = query(qRef, where('${f.field}', '${op}', ${JSON.stringify(val)}));\n`;
    });
    (q.orderBy || []).forEach(o => {
      const dir = (o.direction || o.dir || '').toLowerCase().startsWith('desc')
        ? "'desc'"
        : "'asc'";
      code += `qRef = query(qRef, orderBy('${o.field}', ${dir}));\n`;
    });
    code += `const snap = await getDocs(qRef);\nconsole.log(snap.docs.map(d=>({ id: d.id, ...d.data() })));`;
    return code;
  },

  toReact(q) {
    const web = { importFrom: 'firebase/firestore', dbVar: 'db' };
    if (isDocumentLookup(q)) {
      return webDocumentLookupExport(q, {
        ...web,
        header: '// React (Web SDK): document lookup',
      });
    }
    if (isAggregationQuery(q)) {
      return webAggregationExport(q, {
        ...web,
        header: '// React (Web SDK): aggregation query',
      });
    }

    const path = q.collectionPath || q.collection || 'UNKNOWN';
    const isGroup = !!q.isCollectionGroup;
    const needsCollectionGroup = isGroup;
    const imports = [
      needsCollectionGroup ? 'collectionGroup' : 'collection',
      'query',
      'where',
      'orderBy',
      'getDocs',
    ]
      .filter(Boolean)
      .join(', ');

    let code = `// React (Web SDK) — query only\n`;
    code += `import { ${imports} } from 'firebase/firestore';\n\n`;
    code += `// Assumes you have a Firestore instance: const db = ...\n`;
    code += `const ref = ${isGroup ? `collectionGroup(db, '${path}')` : `collection(db, '${path}')`};\n`;
    code += `let qRef = ref;\n`;
    (q.filters || []).forEach(f => {
      const op = toSymbolOp(f.op);
      const val = normalizeValue(f.value);
      code += `qRef = query(qRef, where('${f.field}', '${op}', ${JSON.stringify(val)}));\n`;
    });
    (q.orderBy || []).forEach(o => {
      const dir = (o.direction || o.dir || '').toLowerCase().startsWith('desc')
        ? "'desc'"
        : "'asc'";
      code += `qRef = query(qRef, orderBy('${o.field}', ${dir}));\n`;
    });
    code += `const snap = await getDocs(qRef);\nconsole.log(snap.docs.map(d=>({ id: d.id, ...d.data() })));`;
    return code;
  },

  toNextClient(q) {
    const web = { importFrom: 'firebase/firestore', dbVar: 'db' };
    if (isDocumentLookup(q)) {
      return webDocumentLookupExport(q, {
        ...web,
        header: '// Next.js (Client, Web SDK): document lookup',
      });
    }
    if (isAggregationQuery(q)) {
      return webAggregationExport(q, {
        ...web,
        header: '// Next.js (Client, Web SDK): aggregation query',
      });
    }

    const path = q.collectionPath || q.collection || 'UNKNOWN';
    const isGroup = !!q.isCollectionGroup;
    const needsCollectionGroup = isGroup;
    const imports = [
      needsCollectionGroup ? 'collectionGroup' : 'collection',
      'query',
      'where',
      'orderBy',
      'getDocs',
    ]
      .filter(Boolean)
      .join(', ');

    let code = `// Next.js (Client, Web SDK) — query only\n`;
    code += `import { ${imports} } from 'firebase/firestore';\n\n`;
    code += `// Assumes you have a Firestore instance: const db = ...\n`;
    code += `const ref = ${isGroup ? `collectionGroup(db, '${path}')` : `collection(db, '${path}')`};\n`;
    code += `let qRef = ref;\n`;
    (q.filters || []).forEach(f => {
      const op = toSymbolOp(f.op);
      const val = normalizeValue(f.value);
      code += `qRef = query(qRef, where('${f.field}', '${op}', ${JSON.stringify(val)}));\n`;
    });
    (q.orderBy || []).forEach(o => {
      const dir = (o.direction || o.dir || '').toLowerCase().startsWith('desc')
        ? "'desc'"
        : "'asc'";
      code += `qRef = query(qRef, orderBy('${o.field}', ${dir}));\n`;
    });
    code += `const snap = await getDocs(qRef);\nconsole.log(snap.docs.map(d=>({ id: d.id, ...d.data() })));`;
    return code;
  },

  toNextServer(q) {
    if (isDocumentLookup(q)) {
      return adminDocumentLookupExport(q, {
        header: '// Next.js (Server, Admin SDK): document lookup',
      });
    }
    if (isAggregationQuery(q)) {
      return adminAggregationExport(q, {
        header: '// Next.js (Server, Admin SDK): aggregation query',
      });
    }

    const path = q.collectionPath || q.collection || 'UNKNOWN';
    const isGroup = !!q.isCollectionGroup;
    let code = `// Next.js (Server, Admin SDK) — query only\n`;
    code += `const db = admin.firestore();\n`;
    code += `let ref = ${isGroup ? `db.collectionGroup('${path}')` : `db.collection('${path}')`};\n`;
    const chain = [];
    (q.filters || []).forEach(f => {
      const op = toSymbolOp(f.op);
      const val = normalizeValue(f.value);
      chain.push(`.where('${f.field}', '${op}', ${JSON.stringify(val)})`);
    });
    (q.orderBy || []).forEach(o => {
      const dir = (o.direction || o.dir || '').toLowerCase().startsWith('desc')
        ? "'desc'"
        : "'asc'";
      chain.push(`.orderBy('${o.field}', ${dir})`);
    });
    code += `const queryRef = ref${chain.length ? '\n  ' + chain.join('\n  ') : ''};\n`;
    code += `const snap = await queryRef.get();\nconsole.log(snap.docs.map(d=>({ id: d.id, ...d.data() })));`;
    return code;
  },

  toNode(q) {
    if (isDocumentLookup(q)) {
      return adminDocumentLookupExport(q, {
        header: '// Node.js Admin SDK example (document lookup)',
      });
    }
    if (isAggregationQuery(q)) {
      return adminAggregationExport(q, {
        header: '// Node.js Admin SDK example (aggregation query)',
      });
    }

    const path = q.collectionPath || q.collection || 'UNKNOWN';
    const isGroup = !!q.isCollectionGroup;
    let code = `// Node.js Admin SDK example\n`;
    code += `const db = admin.firestore();\n`;
    code += `let ref = ${isGroup ? `db.collectionGroup('${path}')` : `db.collection('${path}')`};\n`;
    const chain = [];
    (q.filters || []).forEach(f => {
      const op = toSymbolOp(f.op);
      const val = normalizeValue(f.value);
      chain.push(`.where('${f.field}', '${op}', ${JSON.stringify(val)})`);
    });
    (q.orderBy || []).forEach(o => {
      const dir = (o.direction || o.dir || '').toLowerCase().startsWith('desc')
        ? "'desc'"
        : "'asc'";
      chain.push(`.orderBy('${o.field}', ${dir})`);
    });
    code += `const queryRef = ref${chain.length ? '\n  ' + chain.join('\n  ') : ''};\n`;
    code += `const snap = await queryRef.get();\nconsole.log(snap.docs.map(d=>({ id: d.id, ...d.data() })));`;
    return code;
  },

  toFlutter(q) {
    if (isDocumentLookup(q)) {
      const paths = getLookupDocPaths(q);
      const header = '// Flutter Firestore example (document lookup)';
      if (!paths.length) return `${header}\n${NO_DOC_PATHS_NOTE}`;

      if (paths.length === 1) {
        let code = `${header}\n`;
        code += `// Reads exactly this document (1 read), not the parent collection.\n`;
        code += `final snap = await FirebaseFirestore.instance.doc(${sq(paths[0])}).get();\n`;
        code += `print(snap.exists ? snap.data() : null);`;
        return code;
      }

      let code = `${header}\n`;
      code += `// Reads exactly these documents (${paths.length} reads), not the parent collections.\n`;
      code += `final paths = [\n${paths.map(p => `  ${sq(p)},`).join('\n')}\n];\n`;
      code += `for (final p in paths) {\n`;
      code += `  final snap = await FirebaseFirestore.instance.doc(p).get();\n`;
      code += `  print(snap.exists ? snap.data() : null);\n`;
      code += `}`;
      return code;
    }

    if (isAggregationQuery(q)) {
      const path = q.collectionPath || q.collection || 'UNKNOWN';
      const isGroup = !!q.isCollectionGroup;
      const { aggregations, defaulted } = resolveAggregations(q);

      let code = `// Flutter Firestore example (aggregation query)\n`;
      if (defaulted) {
        code += `// FireScope did not capture the aggregation list for this request; defaulting to COUNT.\n`;
      }
      code += `final ref = FirebaseFirestore.instance.${isGroup ? `collectionGroup(${sq(path)})` : `collection(${sq(path)})`};\n`;
      code += `var queryRef = ref`;

      (q.filters || []).forEach(f => {
        const param = toFlutterParam(toSymbolOp(f.op));
        const val = normalizeValue(f.value);
        code += `\n  .where(${sq(f.field)}, ${param}: ${dartify(val)})`;
      });
      (q.orderBy || []).forEach(o => {
        const desc = (o.direction || o.dir || '')
          .toLowerCase()
          .startsWith('desc')
          ? 'true'
          : 'false';
        code += `\n  .orderBy(${sq(o.field)}, descending: ${desc})`;
      });
      code += `;\n`;

      const specs = aggregations.map(a => {
        if (a.op === 'count') return 'count()';
        return `${a.op === 'avg' ? 'average' : 'sum'}(${sq(a.field)})`;
      });
      code += `// Server-side aggregation: billed per index entry scanned, not per document.\n`;
      code += `final snap = await queryRef.aggregate(${specs.join(', ')}).get();\n`;
      code += aggregations
        .map(a => {
          if (a.op === 'count') return `print(snap.count);`;
          const getter = a.op === 'avg' ? 'getAverage' : 'getSum';
          return `print(snap.${getter}(${sq(a.field)}));`;
        })
        .join('\n');
      return code;
    }

    const path = q.collectionPath || q.collection || 'UNKNOWN';
    const isGroup = !!q.isCollectionGroup;
    let code = `// Flutter Firestore example\n`;
    code += `final ref = FirebaseFirestore.instance.${isGroup ? `collectionGroup('${path}')` : `collection('${path}')`};\n`;
    code += `var queryRef = ref`;

    (q.filters || []).forEach(f => {
      const opSym = toSymbolOp(f.op);
      const param = toFlutterParam(opSym);
      const val = normalizeValue(f.value);
      if (
        param === 'whereIn' ||
        param === 'whereNotIn' ||
        param === 'arrayContainsAny'
      ) {
        code += `\n  .where('${f.field}', ${param}: ${dartify(val)})`;
      } else if (param === 'arrayContains') {
        code += `\n  .where('${f.field}', ${param}: ${dartify(val)})`;
      } else {
        code += `\n  .where('${f.field}', ${param}: ${dartify(val)})`;
      }
    });

    (q.orderBy || []).forEach(o => {
      const desc = (o.direction || o.dir || '').toLowerCase().startsWith('desc')
        ? 'true'
        : 'false';
      code += `\n  .orderBy('${o.field}', descending: ${desc})`;
    });

    code += `;\nfinal snap = await queryRef.get();\nprint(snap.docs.map((d)=>d.data()));`;
    return code;
  },

  toJSON(q) {
    return JSON.stringify(q, null, 2);
  },
};
