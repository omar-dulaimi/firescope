// Shared helpers for building Firebase Console links and query strings
import { CONFIG } from './config.js';

export function extractProjectId(url) {
  try {
    const urlParams = new URLSearchParams(url.split('?')[1] || '');
    const database = urlParams.get('database');
    if (database) {
      const match = database.match(/projects\/([^/]+)/);
      return match ? match[1] : null;
    }
    const pathMatch = url.match(/projects\/([^/]+)/);
    return pathMatch ? pathMatch[1] : null;
  } catch (_e) {
    return null;
  }
}

export function extractDatabaseId(url) {
  const normalizeId = id => {
    const v = decodeURIComponent((id || '').trim());
    return !v || v === '(default)' ? '-default-' : v;
  };
  try {
    const urlParams = new URLSearchParams(url.split('?')[1] || '');
    const database = urlParams.get('database');
    if (database) {
      const match = database.match(/databases\/([^/]+)/);
      return normalizeId(match ? match[1] : database);
    }
    const pathMatch = url.match(/databases\/([^/]+)/);
    return normalizeId(pathMatch ? pathMatch[1] : null);
  } catch (_e) {
    return '-default-';
  }
}

export function isTimestamp(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{9}Z$/.test(value)
  );
}

export function mapOperator(op) {
  switch (op) {
    case '==':
      return 'EQUAL';
    case '!=':
      return 'NOT_EQUAL';
    case '<':
      return 'LESS_THAN';
    case '<=':
      return 'LESS_THAN_OR_EQUAL';
    case '>':
      return 'GREATER_THAN';
    case '>=':
      return 'GREATER_THAN_OR_EQUAL';
    case 'array-contains':
      return 'ARRAY_CONTAINS';
    case 'in':
      return 'IN';
    case 'not-in':
      return 'NOT_IN';
    case 'array-contains-any':
      return 'ARRAY_CONTAINS_ANY';
    // Already-normalized enum-like operators
    case 'EQUAL':
      return 'EQUAL';
    case 'NOT_EQUAL':
      return 'NOT_EQUAL';
    case 'LESS_THAN':
      return 'LESS_THAN';
    case 'LESS_THAN_OR_EQUAL':
      return 'LESS_THAN_OR_EQUAL';
    case 'GREATER_THAN':
      return 'GREATER_THAN';
    case 'GREATER_THAN_OR_EQUAL':
      return 'GREATER_THAN_OR_EQUAL';
    case 'IN':
      return 'IN';
    case 'NOT_IN':
      return 'NOT_IN';
    case 'ARRAY_CONTAINS':
      return 'ARRAY_CONTAINS';
    case 'ARRAY_CONTAINS_ANY':
      return 'ARRAY_CONTAINS_ANY';
    default:
      return 'EQUAL';
  }
}

export function getOperatorCode(operator) {
  switch (operator) {
    case 'EQUAL':
      return 'EQ';
    case 'NOT_EQUAL':
      return 'NEQ';
    case 'LESS_THAN':
      return 'LT';
    case 'LESS_THAN_OR_EQUAL':
      return 'LTE';
    case 'GREATER_THAN':
      return 'GT';
    case 'GREATER_THAN_OR_EQUAL':
      return 'GTE';
    case 'ARRAY_CONTAINS':
      return 'AC';
    case 'IN':
      return 'IN';
    case 'NOT_IN':
      return 'NIN';
    case 'ARRAY_CONTAINS_ANY':
      return 'ACA';
    default:
      return 'EQ';
  }
}

export function buildQueryString(
  filters = [],
  orderBy = [],
  aggregations = [],
  limit = null
) {
  const clauses = [];
  const debug = (...args) => {
    try {
      // guard: use globalThis.__DEV__ if available, otherwise no-op
      if (typeof globalThis !== 'undefined' && globalThis.__DEV__) {
        console.debug('[FSQL]', ...args);
      }
    } catch (_e) {
      // ignore
    }
  };

  // WHERE clauses
  filters.forEach(filter => {
    const mappedOp = mapOperator(filter.op);
    debug('WHERE mapOperator', { field: filter.field, opIn: filter.op, opOut: mappedOp, value: filter.value });
    clauses.push({
      type: 0,
      propertyFilters: [
        {
          propertyName: filter.field,
          operator: mappedOp,
          value: filter.value,
        },
      ],
    });
  });

  // ORDER BY clauses
  orderBy.forEach(order => {
    clauses.push({
      type: 1,
      propertyName: order.field,
      direction: order.direction,
    });
  });

  // Aggregations
  const getFieldName = f => (f && typeof f === 'object' && f.fieldPath) ? f.fieldPath : f;
  aggregations?.forEach(agg => {
    if (agg.count !== undefined) clauses.push({ type: 3 });
    if (agg.sum !== undefined) {
      clauses.push({ type: 4, propertyName: getFieldName(agg.sum.field) });
    }
    if (agg.avg !== undefined) {
      clauses.push({ type: 5, propertyName: getFieldName(agg.avg.field) });
    }
  });

  // LIMIT clause
  if (typeof limit === 'number' && isFinite(limit)) {
    clauses.push({ type: 2, limit });
  }

  if (!clauses.length) return '';

  const parts = [];
  parts.push(clauses.length.toString());

  for (const clause of clauses) {
    const clauseParts = [];

    switch (clause.type) {
      case 0: {
        clauseParts.push('WH');
        clauseParts.push('1');
        const filter = clause.propertyFilters[0];
        clauseParts.push(
          `${filter.propertyName.length}/${filter.propertyName}`
        );
        clauseParts.push(getOperatorCode(filter.operator));

        if (Array.isArray(filter.value)) {
          clauseParts.push('ARR');
          clauseParts.push(filter.value.length.toString());
          filter.value.forEach(v => {
            if (typeof v === 'boolean') {
              clauseParts.push('BL');
              clauseParts.push(`${v.toString().length}/${v}`);
            } else if (typeof v === 'number') {
              clauseParts.push('NUM');
              clauseParts.push(`1/${v}`);
            } else if (isTimestamp(v)) {
              clauseParts.push('TS');
              clauseParts.push(`${v.length}/${v}`);
            } else {
              clauseParts.push('STR');
              clauseParts.push(`${v.toString().length}/${v}`);
            }
          });
        } else if (typeof filter.value === 'boolean') {
          clauseParts.push('BL');
          clauseParts.push(`${filter.value.toString().length}/${filter.value}`);
        } else if (typeof filter.value === 'number') {
          clauseParts.push('NUM');
          clauseParts.push(`1/${filter.value}`);
        } else if (isTimestamp(filter.value)) {
          clauseParts.push('TS');
          clauseParts.push(`${filter.value.length}/${filter.value}`);
        } else {
          clauseParts.push('STR');
          clauseParts.push(`${filter.value.toString().length}/${filter.value}`);
        }
        break;
      }

      case 2:
        clauseParts.push('LIM');
        clauseParts.push(`1/${clause.limit}`);
        break;

      case 1:
        clauseParts.push('ORD');
        clauseParts.push(
          `${clause.propertyName.length}/${clause.propertyName}`
        );
        clauseParts.push(clause.direction === 'ASCENDING' ? 'ASC' : 'DESC');
        break;

      case 3:
        clauseParts.push('COU');
        break;

      case 4:
        clauseParts.push('SUM');
        clauseParts.push(
          `${clause.propertyName.length}/${clause.propertyName}`
        );
        break;

      case 5:
        clauseParts.push('AVG');
        clauseParts.push(
          `${clause.propertyName.length}/${clause.propertyName}`
        );
        break;
    }

    parts.push(clauseParts.join('|'));
  }

  const out = parts.join('|');
  debug('QueryString built', out);
  return out;
}

function formatFirestoreValue(valueObj) {
  if (typeof valueObj !== 'object' || valueObj === null) {
    return valueObj;
  }
  const valueType = Object.keys(valueObj)[0];
  if (!valueType) return valueObj;
  const value = valueObj[valueType];
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
      return value.values ? value.values.map(v => formatFirestoreValue(v)) : [];
    case 'mapValue':
      return value.fields || {};
    default:
      return valueObj;
  }
}

export function createFirestoreLink(
  url,
  collection,
  documentId = null,
  queryInfo = null
) {
  const debug = (...args) => {
    try {
      if (typeof globalThis !== 'undefined' && globalThis.__DEV__) {
        console.debug('[FSLINK]', ...args);
      }
    } catch (_e) {
      // ignore
    }
  };
  const projectId = extractProjectId(url);
  const databaseId = extractDatabaseId(url);
  if (!projectId) return null;

  if (!documentId && queryInfo && (queryInfo.filters || queryInfo.orderBy)) {
    // Normalize Firestore-typed values to raw scalars for query building
    const normalizedFilters = (queryInfo.filters || []).map(filter => ({
      field: filter.field,
      op: filter.op,
      value: formatFirestoreValue(filter.value),
    }));
    debug('Inputs', { url, collection, documentId, queryInfo });
    const queryString = buildQueryString(
      normalizedFilters,
      queryInfo.orderBy,
      queryInfo.aggregations,
      queryInfo.limit
    );
    debug('QueryString', queryString);

    if (queryInfo.isCollectionGroup) {
      const collectionName = collection.startsWith('/')
        ? collection.substring(1)
        : collection;
      const built = CONFIG.FIRESTORE_QUERY_URL_COLLECTION_GROUP.replace(
        '{PROJECT_ID}',
        projectId
      )
        .replace('{DATABASE}', databaseId)
        .replace('{COLLECTION}', collectionName)
        .replace('{QUERY}', encodeURIComponent(queryString));
      debug('URL (group)', built);
      return built;
    } else {
      const built = CONFIG.FIRESTORE_QUERY_URL.replace('{PROJECT_ID}', projectId)
        .replace('{DATABASE}', databaseId)
        .replace('{COLLECTION}', collection)
        .replace('{QUERY}', encodeURIComponent(queryString));
      debug('URL (collection)', built);
      return built;
    }
  }

  const baseUrl = CONFIG.FIRESTORE_CONSOLE_URL.replace(
    '{PROJECT_ID}',
    projectId
  )
    .replace('{DATABASE}', databaseId)
    .replace('{COLLECTION}', collection);

  const direct = documentId
    ? baseUrl.replace('{DOCUMENT}', documentId)
    : baseUrl.replace('/{DOCUMENT}', '');
  debug('URL (document/direct)', direct);
  return direct;
}
