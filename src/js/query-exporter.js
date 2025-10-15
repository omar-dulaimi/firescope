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

export const QueryExporter = {
  toAngular(q) {
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
