/**
 * Application configuration constants
 */
export const CONFIG = {
  TARGET_URL: 'https://firestore.googleapis.com/',
  INITIAL_EXPANDED_DEPTH: 4,
  MAX_RECONNECT_ATTEMPTS: 3,
  RECONNECT_DELAY: 1000, // Base delay in ms
  HEARTBEAT_INTERVAL: 30000, // 30 seconds
  OPERATOR_MAP: {
    EQUAL: '==',
    NOT_EQUAL: '!=',
    GREATER_THAN: '>',
    GREATER_THAN_OR_EQUAL: '>=',
    LESS_THAN: '<',
    LESS_THAN_OR_EQUAL: '<=',
    ARRAY_CONTAINS: 'array-contains',
    IN: 'in',
    ARRAY_CONTAINS_ANY: 'array-contains-any',
    NOT_IN: 'not-in',
  },
  FIRESTORE_CONSOLE_URL:
    'https://console.firebase.google.com/project/{PROJECT_ID}/firestore/databases/{DATABASE}/data/{COLLECTION}/{DOCUMENT}',
  FIRESTORE_QUERY_URL:
    'https://console.firebase.google.com/project/{PROJECT_ID}/firestore/databases/{DATABASE}/data?view=query-view&query={QUERY}&scopeType=collection&scopeName=%2F{COLLECTION}',
  FIRESTORE_QUERY_URL_COLLECTION_GROUP:
    'https://console.firebase.google.com/project/{PROJECT_ID}/firestore/databases/{DATABASE}/data?view=query-view&query={QUERY}&scopeType=collection_group&scopeName={COLLECTION}',
};

/**
 * DOM element references
 */
export const DOM =
  typeof document !== 'undefined'
    ? {
        requestsContainer: document.getElementById('requests'),
        collectionsToggle: document.getElementById('collectionsToggle'),
        collectionsPopover: document.getElementById('collectionsPopover'),
        collectionsContainer: document.getElementById('collectionsContainer'),
        collectionsCount: document.getElementById('collectionsCount'),
        clearButton: document.getElementById('clearButton'),
        exportAllButton: document.getElementById('exportAllButton'),
        requestsView: document.getElementById('requestsView'),
        notifications: document.getElementById('notifications'),
        searchInput: document.getElementById('searchInput'),
        clearSearchButton: document.getElementById('clearSearchButton'),
        settingsButton: document.getElementById('settingsButton'),
        settingsModal: document.getElementById('settingsModal'),
      }
    : {};
