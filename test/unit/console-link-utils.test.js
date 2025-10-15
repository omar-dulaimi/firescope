import { describe, it, expect } from 'vitest';
import {
  extractProjectId,
  extractDatabaseId,
  createFirestoreLink,
} from '../../src/js/console-link-utils.js';

describe('console-link-utils', () => {
  const urlDefaultPath =
    'https://firestore.googleapis.com/v1/projects/my-project/databases/(default)/documents/Users/123';
  const urlDefaultParam =
    'https://firestore.googleapis.com/v1/projects/my-project/databases/(default)/documents?database=projects%2Fmy-project%2Fdatabases%2F(default)';
  const urlCustomParam =
    'https://firestore.googleapis.com/v1/projects/my-project/databases/db1/documents?database=projects%2Fmy-project%2Fdatabases%2Fdb1';

  it('extracts project id from path and param', () => {
    expect(extractProjectId(urlDefaultPath)).toBe('my-project');
    expect(extractProjectId(urlDefaultParam)).toBe('my-project');
    expect(extractProjectId(urlCustomParam)).toBe('my-project');
  });

  it('extracts and normalizes database id', () => {
    expect(extractDatabaseId(urlDefaultPath)).toBe('-default-');
    expect(extractDatabaseId(urlDefaultParam)).toBe('-default-');
    expect(extractDatabaseId(urlCustomParam)).toBe('db1');
  });

  it('builds document links with correct database', () => {
    const linkDefault = createFirestoreLink(urlDefaultPath, 'Users', '123');
    expect(linkDefault).toContain('/project/my-project/');
    expect(linkDefault).toContain('/firestore/databases/-default-/');
    expect(linkDefault).toContain('/data/Users/123');

    const linkCustom = createFirestoreLink(urlCustomParam, 'Users', '123');
    expect(linkCustom).toContain('/firestore/databases/db1/');
  });

  it('builds query links for collection and collection group', () => {
    const linkCollection = createFirestoreLink(urlDefaultParam, 'Users', null, {
      filters: [{ field: 'age', op: '>=', value: { integerValue: '18' } }],
      orderBy: [{ field: 'name', direction: 'ASCENDING' }],
    });
    expect(linkCollection).toContain('/firestore/databases/-default-/');
    expect(linkCollection).toContain('view=query-view');
    expect(linkCollection).toContain('scopeType=collection');
    expect(linkCollection).toContain('scopeName=%2FUsers');
    expect(linkCollection).toContain('query=');

    const linkGroup = createFirestoreLink(urlDefaultParam, '/Users', null, {
      isCollectionGroup: true,
      filters: [{ field: 'age', op: '>=', value: { integerValue: '18' } }],
      orderBy: [{ field: 'name', direction: 'ASCENDING' }],
    });
    expect(linkGroup).toContain('scopeType=collection_group');
    expect(linkGroup).toContain('scopeName=Users');
  });

  it('maps uppercase ARRAY_CONTAINS to correct operator in query', () => {
    const urlDefaultParam =
      'https://firestore.googleapis.com/v1/projects/my-project/databases/(default)/documents?database=projects%2Fmy-project%2Fdatabases%2F(default)';
    const link = createFirestoreLink(urlDefaultParam, 'Posts', null, {
      filters: [
        {
          field: 'tags',
          op: 'ARRAY_CONTAINS',
          value: { stringValue: 'javascript' },
        },
      ],
      orderBy: [{ field: '__name__', direction: 'ASCENDING' }],
    });
    expect(link).toContain('view=query-view');
    expect(decodeURIComponent(link)).toMatch(
      /\|WH\|1\|4\/tags\|AC\|STR\|10\/javascript/
    );
  });

  it('encodes limit in query string', () => {
    const url =
      'https://firestore.googleapis.com/v1/projects/my-project/databases/(default)/documents?database=projects%2Fmy-project%2Fdatabases%2F(default)';
    const link = createFirestoreLink(url, 'Posts', null, {
      filters: [],
      orderBy: [{ field: '__name__', direction: 'ASCENDING' }],
      limit: 5,
    });
    const decoded = decodeURIComponent(link);
    expect(decoded).toMatch(/\|LIM\|1\/5/);
  });
});
