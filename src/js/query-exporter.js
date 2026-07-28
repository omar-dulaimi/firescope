const SYMBOL_OPS = {
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

const JS_SYMBOL_OPS = new Set(Object.values(SYMBOL_OPS));

/**
 * The captured comparison operator as the JS SDKs spell it, or null when
 * FireScope has no spelling for it.
 *
 * Returning the wire name unchanged is what produced `where(f, 'IS_NULL', null)`:
 * a call no SDK accepts. An operator we cannot name is reported, not guessed.
 */
function toSymbolOp(op) {
  if (op === undefined || op === null || op === '') return '==';
  if (SYMBOL_OPS[op]) return SYMBOL_OPS[op];
  return JS_SYMBOL_OPS.has(op) ? op : null;
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
  return map[op] || null;
}

/**
 * `== null` and `== NaN` never travel as comparisons. Firestore rewrites them
 * into one of four unary operators, and every SDK spells those differently, so
 * the wire name has to be translated per target rather than passed through.
 *
 * Each spelling below was checked by round-tripping it back through the SDK that
 * owns it and reading what came out on the wire:
 *   - Web SDK / AngularFire (firebase 10.14.1): where(f, '==', null) produces
 *     IS_NULL, where(f, '==', NaN) produces IS_NAN, and the '!=' forms produce
 *     IS_NOT_NULL / IS_NOT_NAN.
 *   - Admin SDK: @google-cloud/firestore does the same translation in
 *     FieldFilterInternal.toProto (isNullChecking/isNanChecking).
 *   - Flutter: cloud_firestore turns isNull: true/false into '=='/'!=' against
 *     null, and the native serializer turns '=='/'!=' against NaN into
 *     IS_NAN / IS_NOT_NAN.
 *
 * Flutter must use `isNull:` rather than `isEqualTo: null`, because
 * cloud_firestore only applies `isEqualTo` when it is non-null: passing null
 * drops the clause silently, which turns the export into a whole-collection read
 * instead of an error.
 */
const UNARY_FILTERS = {
  IS_NULL: { js: "'==', null", dart: 'isNull: true' },
  IS_NOT_NULL: { js: "'!=', null", dart: 'isNull: false' },
  IS_NAN: { js: "'==', NaN", dart: 'isEqualTo: double.nan' },
  IS_NOT_NAN: { js: "'!=', NaN", dart: 'isNotEqualTo: double.nan' },
};

const NO_OP_SPELLING = 'that this SDK has no spelling for';
const NO_VALUE_LITERAL = 'whose value has no faithful literal here';

/**
 * A captured clause we cannot spell for this target is left out of the export,
 * which makes the exported query read a wider slice than the app did. Say so:
 * silently emitting fewer filters is exactly how an export turns into a bill.
 *
 * `reason` distinguishes an operator we cannot name from a value we cannot name,
 * because they are fixed in different places.
 */
function droppedFilterNote(f, reason) {
  const field = f?.field == null ? '(unnamed field)' : String(f.field);
  const op = f?.op == null ? '(unknown operator)' : String(f.op);
  return (
    `// FireScope captured a ${op} filter on ${field} ${reason}.\n` +
    `// It is left out, so this query reads MORE documents than the app did.\n`
  );
}

function dartify(value) {
  // Basic JSON -> Dart literal; booleans/numbers fine; strings quoted; arrays/maps JSON-like are acceptable for examples
  const json = JSON.stringify(value);
  // A double-quoted Dart string interpolates `$`, so an unescaped one either
  // fails to compile or silently substitutes something else.
  return json === undefined ? undefined : json.replace(/\$/g, '\\$');
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
 * The captured `limit`, as a usable document count, or null when the request had
 * none. Anything that is not a positive whole number is treated as absent rather
 * than emitted, so a malformed capture cannot invent a cap the request never had.
 */
function getLimit(q) {
  const raw = q?.limit;
  const n =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  const count = Math.trunc(n);
  return count > 0 ? count : null;
}

/**
 * A limit is a billing guard: it is the difference between reading `n` documents
 * and reading the whole collection, and collection reads are billed per document.
 * Say so in the export, the same way the aggregation and lookup exports do.
 */
function limitNote(count) {
  return `// Captured limit: this query reads at most ${count} document${count === 1 ? '' : 's'}.\n`;
}

// ---------------------------------------------------------------------------
// Wire values, then cursors
//
// A filter value and a cursor value are the same thing on the wire: a Firestore
// `Value`. Both go through decodeWireValue/renderWireValue below, deliberately.
// They used to have separate converters, and the filter one was wrong in every
// way the cursor one had already been fixed: a timestamp came out as the string
// Firestore happened to encode it as, and a map came out as its raw wire
// encoding. Neither errored. Both ran, and answered a different question.
//
// A `startAt` / `endAt` cursor bounds the slice of the ordered range a query
// reads. Losing one widens the read to the whole range, which Firestore bills
// per document returned, so a dropped cursor costs the user the same way a
// dropped `limit` does.
//
// The four wire shapes below were read off the real Firebase Web SDK
// (firebase 10.14.1) rather than guessed:
//   startAt(v)     -> startAt: { before: true,  values: [...] }
//   startAfter(v)  -> startAt: { before: false, values: [...] }
//   endAt(v)       -> endAt:   { before: false, values: [...] }
//   endBefore(v)   -> endAt:   { before: true,  values: [...] }
// `before` is proto3 JSON, so false is allowed to be omitted entirely and the
// Admin SDK really does omit it. Absent therefore has to read as false.
// ---------------------------------------------------------------------------

const CURSOR_SIDES = [
  ['startAt', 'startAt', 'startAfter'],
  ['endAt', 'endBefore', 'endAt'],
];

const TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/;

const DOCUMENTS_MARKER = '/documents/';

/**
 * A `timestampValue`, as whole seconds plus nanoseconds.
 *
 * Firestore emits nanosecond precision and a JS `Date` only carries
 * milliseconds, so the export builds a Timestamp from the two integers instead
 * of parsing the string: a cursor rounded to the nearest millisecond is a
 * different boundary than the one the app used.
 */
function decodeTimestamp(value) {
  if (value && typeof value === 'object') {
    const seconds = Number(value.seconds ?? 0);
    const nanos = Number(value.nanos ?? value.nanoseconds ?? 0);
    if (!Number.isSafeInteger(seconds) || !Number.isSafeInteger(nanos)) {
      return null;
    }
    return { kind: 'timestamp', seconds, nanos };
  }
  const m = TIMESTAMP_RE.exec(String(value));
  if (!m) return null;
  const ms = Date.parse(`${m[1]}Z`);
  if (!Number.isFinite(ms)) return null;
  return {
    kind: 'timestamp',
    seconds: ms / 1000,
    nanos: m[2] ? Number(m[2].padEnd(9, '0')) : 0,
  };
}

/**
 * A `referenceValue` reduced to the document path an export can rebuild locally.
 * The wire value names the project and database the capture came from; the
 * exported snippet has to resolve against whichever database it is run with.
 */
function decodeReference(value) {
  const raw = String(value);
  const at = raw.indexOf(DOCUMENTS_MARKER);
  let path = at === -1 ? raw : raw.slice(at + DOCUMENTS_MARKER.length);
  try {
    path = decodeURIComponent(path);
  } catch {
    // Already decoded, or not valid percent-encoding: use it as it arrived.
  }
  const segments = path.split('/').filter(Boolean);
  if (!segments.length || segments.length % 2 !== 0) return null;
  return { kind: 'reference', path: segments.join('/') };
}

/**
 * Split one wire `Value` into something each target can render in its own
 * spelling, or null when there is no faithful literal for it.
 *
 * Used for filter values and for cursor values, which are the same wire type.
 *
 * Null is not a failure to be papered over. An approximated cursor points at a
 * different document than the app's did, and an approximated filter value
 * matches different documents than the app's did, so the honest options are the
 * exact value or a note saying what was lost.
 */
function decodeWireValue(v) {
  if (typeof v !== 'object' || v === null) return null;
  const valueType = Object.keys(v)[0];
  if (!valueType) return null;
  const value = v[valueType];
  switch (valueType) {
    case 'stringValue':
      return { kind: 'literal', value: String(value) };
    case 'booleanValue':
      return { kind: 'literal', value: !!value };
    case 'nullValue':
      return { kind: 'literal', value: null };
    case 'integerValue': {
      const n = Number(value);
      // Firestore integers are 64-bit. Past 2^53 no JS or Dart number literal
      // names the same integer, so the bound cannot be reproduced.
      return Number.isSafeInteger(n) ? { kind: 'literal', value: n } : null;
    }
    case 'doubleValue': {
      if (value === 'NaN') return { kind: 'nan' };
      if (value === 'Infinity') return { kind: 'infinity' };
      if (value === '-Infinity') return { kind: 'negativeInfinity' };
      const n = Number(value);
      return Number.isFinite(n) ? { kind: 'literal', value: n } : null;
    }
    case 'timestampValue':
      return decodeTimestamp(value);
    case 'geoPointValue': {
      const latitude = Number(value?.latitude ?? 0);
      const longitude = Number(value?.longitude ?? 0);
      return Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { kind: 'geoPoint', latitude, longitude }
        : null;
    }
    case 'referenceValue':
      return decodeReference(value);
    case 'arrayValue': {
      const raw = Array.isArray(value?.values) ? value.values : [];
      const items = raw.map(decodeWireValue);
      return items.some(i => i === null) ? null : { kind: 'array', items };
    }
    case 'mapValue': {
      const fields = value?.fields;
      if (fields != null && typeof fields !== 'object') return null;
      const entries = Object.entries(fields || {}).map(([k, val]) => [
        k,
        decodeWireValue(val),
      ]);
      return entries.some(([, val]) => val === null)
        ? null
        : { kind: 'map', entries };
    }
    default:
      // bytesValue, and whatever Firestore adds next: no literal we can prove.
      return null;
  }
}

const KEY_FIELD = '__name__';

/**
 * Firestore appends `__name__` to a query's ordering, so the last value of a
 * `startAfter(lastDocument)` cursor lands on the key field. Every SDK treats a
 * cursor value in that position as a document id rather than as a field value:
 * the Web SDK rejects a DocumentReference there outright and wants the plain
 * document id for a collection query, or the whole document path for a
 * collection-group query.
 *
 * Checked by running both spellings through firebase 10.14.1: 'abc' is accepted
 * for a collection and rejected for a group, 'orders/abc' the other way round,
 * and a DocumentReference is rejected for both.
 */
function asDocumentIdCursor(decoded, isGroup) {
  if (!decoded || decoded.kind !== 'reference') return decoded;
  const segments = decoded.path.split('/');
  return {
    kind: 'literal',
    value: isGroup ? decoded.path : segments[segments.length - 1],
  };
}

/**
 * The cursors a captured query carried, each already resolved to the SDK call it
 * maps to. Cursor values are positional: value `i` belongs to `orderBy[i]`.
 *
 * `values` is null when at least one of the cursor's values has no faithful
 * literal for any target: a cursor is all of its values or none of them, because
 * a partial cursor points somewhere the app never pointed.
 */
function getCursors(q) {
  const orderBy = Array.isArray(q?.orderBy) ? q.orderBy : [];
  const isGroup = !!q?.isCollectionGroup;
  const out = [];
  for (const [key, whenBefore, whenAfter] of CURSOR_SIDES) {
    const raw = q?.[key];
    const values = Array.isArray(raw?.values) ? raw.values : null;
    if (!values || !values.length) continue;
    const decoded = values.map((v, i) => {
      const value = decodeWireValue(v);
      return orderBy[i]?.field === KEY_FIELD
        ? asDocumentIdCursor(value, isGroup)
        : value;
    });
    out.push({
      fn: raw.before === true ? whenBefore : whenAfter,
      values: decoded.some(d => d === null) ? null : decoded,
    });
  }
  return out;
}

function renderWireValue(decoded, dialect) {
  switch (decoded.kind) {
    case 'nan':
      return dialect.nan;
    case 'infinity':
      return dialect.infinity;
    case 'negativeInfinity':
      return dialect.negativeInfinity;
    case 'timestamp':
      return dialect.timestamp(decoded.seconds, decoded.nanos);
    case 'geoPoint':
      return dialect.geoPoint(decoded.latitude, decoded.longitude);
    case 'reference':
      return dialect.reference(decoded.path);
    case 'array':
      return `[${decoded.items.map(i => renderWireValue(i, dialect)).join(', ')}]`;
    case 'map':
      return `{ ${decoded.entries
        .map(
          ([k, val]) => `${dialect.key(k)}: ${renderWireValue(val, dialect)}`
        )
        .join(', ')} }`;
    default:
      return dialect.literal(decoded.value);
  }
}

function webDialect(dbVar) {
  return {
    literal: JSON.stringify,
    nan: 'NaN',
    infinity: 'Infinity',
    negativeInfinity: '-Infinity',
    timestamp: (seconds, nanos) => `new Timestamp(${seconds}, ${nanos})`,
    geoPoint: (lat, lng) => `new GeoPoint(${lat}, ${lng})`,
    reference: path => `doc(${dbVar}, ${sq(path)})`,
    key: objKey,
  };
}

const ADMIN_DIALECT = {
  literal: JSON.stringify,
  nan: 'NaN',
  infinity: 'Infinity',
  negativeInfinity: '-Infinity',
  timestamp: (seconds, nanos) =>
    `new admin.firestore.Timestamp(${seconds}, ${nanos})`,
  geoPoint: (lat, lng) => `new admin.firestore.GeoPoint(${lat}, ${lng})`,
  reference: path => `db.doc(${sq(path)})`,
  key: objKey,
};

const FLUTTER_DIALECT = {
  literal: dartify,
  nan: 'double.nan',
  infinity: 'double.infinity',
  negativeInfinity: '-double.infinity',
  timestamp: (seconds, nanos) => `Timestamp(${seconds}, ${nanos})`,
  geoPoint: (lat, lng) => `GeoPoint(${lat}, ${lng})`,
  reference: path => `FirebaseFirestore.instance.doc(${sq(path)})`,
  key: sq,
};

const CURSOR_NOTE =
  '// Captured cursor: keeps this query to the slice of the ordered range the app read.\n';

/**
 * A cursor we cannot spell here is left out, and leaving it out widens the read
 * back to the whole ordered range. Say which bound was lost and what it costs.
 */
function droppedCursorNote(fn) {
  return (
    `// FireScope captured a ${fn}() cursor whose value has no faithful literal here.\n` +
    `// It is left out, so this query reads a WIDER range than the app did.\n`
  );
}

/**
 * The cursor calls for one target: rendered arguments for every cursor we can
 * express, and a note for every one we cannot.
 */
function cursorCalls(q, dialect, joinArgs) {
  let notes = '';
  const calls = [];
  for (const cursor of getCursors(q)) {
    if (!cursor.values) {
      notes += droppedCursorNote(cursor.fn);
      continue;
    }
    calls.push({
      fn: cursor.fn,
      args: joinArgs(cursor.values.map(v => renderWireValue(v, dialect))),
    });
  }
  return { notes, calls };
}

const joinJsArgs = parts => parts.join(', ');
const joinDartArgs = parts => `[${parts.join(', ')}]`;

/**
 * A clause with no field name cannot be exported: there is nothing to filter on,
 * and emitting `where('undefined', ...)` would query a field the app never used.
 */
function hasField(f) {
  return f?.field != null && String(f.field) !== '';
}

/**
 * The clause's captured value, rendered in `dialect`, or null when it has no
 * faithful literal there.
 *
 * This is the cursor decoder, on purpose. Filter values used to go through a
 * converter of their own that returned the wire encoding when it did not
 * recognise a type and the raw string when it did: `where('createdAt', '>',
 * "2024-03-01T10:00:00Z")` went back to Firestore as a stringValue rather than a
 * timestampValue, and a map filter went back as a map of wire encodings. Those
 * queries run. They just match different documents.
 */
function whereValue(f, dialect) {
  const decoded = decodeWireValue(f?.value);
  return decoded === null ? null : renderWireValue(decoded, dialect);
}

/**
 * The `where(...)` arguments for one captured clause in JS SDK spelling (the Web
 * and Admin SDKs agree on the operator set), or the note that stands in for the
 * clause when it cannot be spelled.
 */
function jsWhereArgs(f, dialect) {
  if (!hasField(f)) return { note: droppedFilterNote(f, NO_OP_SPELLING) };
  const unary = UNARY_FILTERS[f?.op];
  if (unary) return { args: `${sq(f.field)}, ${unary.js}` };
  const op = toSymbolOp(f?.op);
  if (op === null) return { note: droppedFilterNote(f, NO_OP_SPELLING) };
  const value = whereValue(f, dialect);
  if (value === null) return { note: droppedFilterNote(f, NO_VALUE_LITERAL) };
  return { args: `${sq(f.field)}, '${op}', ${value}` };
}

/**
 * The `where(...)` arguments for one captured clause in Flutter spelling, or the
 * note that stands in for the clause when it cannot be spelled.
 */
function flutterWhereArgs(f) {
  if (!hasField(f)) return { note: droppedFilterNote(f, NO_OP_SPELLING) };
  const unary = UNARY_FILTERS[f?.op];
  if (unary) return { args: `${sq(f.field)}, ${unary.dart}` };
  const op = toSymbolOp(f?.op);
  const param = op === null ? null : toFlutterParam(op);
  if (!param) return { note: droppedFilterNote(f, NO_OP_SPELLING) };
  const value = whereValue(f, FLUTTER_DIALECT);
  if (value === null) return { note: droppedFilterNote(f, NO_VALUE_LITERAL) };
  return { args: `${sq(f.field)}, ${param}: ${value}` };
}

function webDirection(o) {
  return (o.direction || o.dir || '').toLowerCase().startsWith('desc')
    ? "'desc'"
    : "'asc'";
}

/**
 * Web SDK (modular) filter/orderBy/cursor/limit lines, operating on a `qRef`
 * variable. `dbVar` names the Firestore instance, which document-reference
 * cursor values need in order to rebuild their `doc(...)` reference.
 */
function webQueryLines(q, dbVar) {
  const dialect = webDialect(dbVar);
  let code = '';
  (q.filters || []).forEach(f => {
    const { args, note } = jsWhereArgs(f, dialect);
    if (note) {
      code += note;
      return;
    }
    code += `qRef = query(qRef, where(${args}));\n`;
  });
  (q.orderBy || []).forEach(o => {
    code += `qRef = query(qRef, orderBy(${sq(o.field)}, ${webDirection(o)}));\n`;
  });
  const { notes, calls } = cursorCalls(q, dialect, joinJsArgs);
  code += notes;
  if (calls.length) code += CURSOR_NOTE;
  calls.forEach(c => {
    code += `qRef = query(qRef, ${c.fn}(${c.args}));\n`;
  });
  const count = getLimit(q);
  if (count !== null) {
    code += limitNote(count);
    code += `qRef = query(qRef, limit(${count}));\n`;
  }
  return code;
}

/**
 * The Web SDK helpers a filter or cursor value needs importing beyond the call
 * that carries it: a Timestamp, GeoPoint or document reference is a constructor
 * call, and an unimported constructor is a snippet that throws on paste.
 */
function valueImports(decoded, acc) {
  if (!decoded) return acc;
  switch (decoded.kind) {
    case 'timestamp':
      acc.add('Timestamp');
      break;
    case 'geoPoint':
      acc.add('GeoPoint');
      break;
    case 'reference':
      acc.add('doc');
      break;
    case 'array':
      decoded.items.forEach(i => valueImports(i, acc));
      break;
    case 'map':
      decoded.entries.forEach(([, val]) => valueImports(val, acc));
      break;
    default:
      break;
  }
  return acc;
}

/**
 * The Web SDK helpers a query needs beyond the collection accessor. `limit` and
 * the cursor helpers are only imported when the request actually carried them,
 * and every helper the emitted lines call must be in here or the snippet will
 * not run.
 */
function webQueryImports(q) {
  const extra = new Set();
  for (const cursor of getCursors(q)) {
    if (!cursor.values) continue;
    extra.add(cursor.fn);
    cursor.values.forEach(v => valueImports(v, extra));
  }
  // Only clauses that survive to a where() call: importing Timestamp for a
  // clause the export had to drop leaves an unused import in the snippet.
  for (const f of q?.filters || []) {
    if (!hasField(f) || UNARY_FILTERS[f?.op]) continue;
    if (toSymbolOp(f?.op) === null) continue;
    valueImports(decodeWireValue(f?.value), extra);
  }
  return [
    'query',
    'where',
    'orderBy',
    ...(getLimit(q) === null ? [] : ['limit']),
    ...extra,
  ];
}

/**
 * Admin SDK filter/orderBy/cursor/limit chain segments, plus any notes that have
 * to precede the statement because a chain cannot carry a comment.
 */
function adminQueryChain(q) {
  const chain = [];
  let notes = '';
  (q.filters || []).forEach(f => {
    const { args, note } = jsWhereArgs(f, ADMIN_DIALECT);
    if (note) {
      notes += note;
      return;
    }
    chain.push(`.where(${args})`);
  });
  (q.orderBy || []).forEach(o => {
    chain.push(`.orderBy(${sq(o.field)}, ${webDirection(o)})`);
  });
  const cursors = cursorCalls(q, ADMIN_DIALECT, joinJsArgs);
  notes += cursors.notes;
  if (cursors.calls.length) notes += CURSOR_NOTE;
  cursors.calls.forEach(c => chain.push(`.${c.fn}(${c.args})`));
  const count = getLimit(q);
  if (count !== null) chain.push(`.limit(${count})`);
  return { chain, notes };
}

/**
 * The whole `const queryRef = ...` statement for the Admin SDK, so that every
 * Admin target builds the chain, limit and cursors included, from one place.
 */
function adminQueryRefStatement(q) {
  const { chain, notes } = adminQueryChain(q);
  const count = getLimit(q);
  let code = notes;
  code += count === null ? '' : limitNote(count);
  code += `const queryRef = ref${chain.length ? '\n  ' + chain.join('\n  ') : ''};\n`;
  return code;
}

/**
 * Flutter filter/orderBy/cursor/limit chain segments, plus any preceding notes.
 */
function flutterQueryChain(q) {
  const chain = [];
  let notes = '';
  (q.filters || []).forEach(f => {
    const { args, note } = flutterWhereArgs(f);
    if (note) {
      notes += note;
      return;
    }
    chain.push(`.where(${args})`);
  });
  (q.orderBy || []).forEach(o => {
    const desc = (o.direction || o.dir || '').toLowerCase().startsWith('desc')
      ? 'true'
      : 'false';
    chain.push(`.orderBy(${sq(o.field)}, descending: ${desc})`);
  });
  const cursors = cursorCalls(q, FLUTTER_DIALECT, joinDartArgs);
  notes += cursors.notes;
  if (cursors.calls.length) notes += CURSOR_NOTE;
  cursors.calls.forEach(c => chain.push(`.${c.fn}(${c.args})`));
  const count = getLimit(q);
  if (count !== null) chain.push(`.limit(${count})`);
  return { chain, notes };
}

/**
 * The whole `var queryRef = ...` statement for Flutter.
 */
function flutterQueryRefStatement(q) {
  const { chain, notes } = flutterQueryChain(q);
  const count = getLimit(q);
  let code = notes;
  code += count === null ? '' : limitNote(count);
  code += `var queryRef = ref${chain.length ? '\n  ' + chain.join('\n  ') : ''};\n`;
  return code;
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
    ...webQueryImports(q),
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
  code += webQueryLines(q, dbVar);
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

  let code = `${header}\n`;
  if (defaulted) {
    code += `// FireScope did not capture the aggregation list for this request; defaulting to COUNT.\n`;
  }
  code += `const db = admin.firestore();\n`;
  code += `let ref = ${isGroup ? `db.collectionGroup('${path}')` : `db.collection('${path}')`};\n`;
  code += adminQueryRefStatement(q);
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
    const imports = [
      'Firestore',
      isGroup ? 'collectionGroup' : 'collection',
      ...webQueryImports(q),
      'getDocs',
    ].join(', ');

    let code = `// AngularFire example\n`;
    code += `import { ${imports} } from '@angular/fire/firestore';\n\n`;
    code += `const ref = ${isGroup ? `collectionGroup(firestore, '${path}')` : `collection(firestore, '${path}')`};\n`;
    code += `let qRef = ref;\n`;
    code += webQueryLines(q, 'firestore');
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
    const imports = [
      isGroup ? 'collectionGroup' : 'collection',
      ...webQueryImports(q),
      'getDocs',
    ].join(', ');

    let code = `// React (Web SDK), query only\n`;
    code += `import { ${imports} } from 'firebase/firestore';\n\n`;
    code += `// Assumes you have a Firestore instance: const db = ...\n`;
    code += `const ref = ${isGroup ? `collectionGroup(db, '${path}')` : `collection(db, '${path}')`};\n`;
    code += `let qRef = ref;\n`;
    code += webQueryLines(q, 'db');
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
    const imports = [
      isGroup ? 'collectionGroup' : 'collection',
      ...webQueryImports(q),
      'getDocs',
    ].join(', ');

    let code = `// Next.js (Client, Web SDK), query only\n`;
    code += `import { ${imports} } from 'firebase/firestore';\n\n`;
    code += `// Assumes you have a Firestore instance: const db = ...\n`;
    code += `const ref = ${isGroup ? `collectionGroup(db, '${path}')` : `collection(db, '${path}')`};\n`;
    code += `let qRef = ref;\n`;
    code += webQueryLines(q, 'db');
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
    let code = `// Next.js (Server, Admin SDK), query only\n`;
    code += `const db = admin.firestore();\n`;
    code += `let ref = ${isGroup ? `db.collectionGroup('${path}')` : `db.collection('${path}')`};\n`;
    code += adminQueryRefStatement(q);
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
    code += adminQueryRefStatement(q);
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
      code += flutterQueryRefStatement(q);

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
    code += flutterQueryRefStatement(q);
    code += `final snap = await queryRef.get();\nprint(snap.docs.map((d)=>d.data()));`;
    return code;
  },

  toJSON(q) {
    return JSON.stringify(q, null, 2);
  },
};
