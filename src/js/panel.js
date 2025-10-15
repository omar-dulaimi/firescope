import { getMoreMenuItems } from '#more-menu';
import { createPanelNavButton, createProcessorNavButton } from '#nav-button';
import { DropdownPortal } from './dropdown-portal.js';
import { QueryExporter } from './query-exporter.js';
import { ThemeManager } from './theme-manager.js';

let port = null;
let connectionRetryCount = 0;
const MAX_RETRY_ATTEMPTS = 5;
let connectionHealthTimer = null;

function createConnection() {
  try {
    port = chrome.runtime.connect({ name: 'firescope-panel' });
    console.log('[FireScope Panel] Connected to background with port:', port);
    connectionRetryCount = 0;

    // Setup message listener
    setupMessageListener();

    // Setup disconnect handler
    port.onDisconnect.addListener(() => {
      console.log(
        '[FireScope Panel] Port disconnected, attempting reconnection...'
      );
      clearTimeout(connectionHealthTimer);
      setTimeout(reconnect, 1000); // Wait 1 second before reconnecting
    });

    // Send initial message
    console.log(
      '[FireScope Panel] Sending init message with tabId:',
      chrome.devtools.inspectedWindow.tabId
    );
    port.postMessage({
      type: 'init',
      tabId: chrome.devtools.inspectedWindow.tabId,
    });

    // Start connection health monitoring
    startConnectionHealthMonitoring();
  } catch (error) {
    console.error('[FireScope Panel] Failed to create connection:', error);
    setTimeout(reconnect, 2000);
  }
}

function reconnect() {
  if (connectionRetryCount >= MAX_RETRY_ATTEMPTS) {
    console.error(
      '[FireScope Panel] Max reconnection attempts reached. Extension may need manual reload.'
    );
    return;
  }

  connectionRetryCount++;
  console.log(
    `[FireScope Panel] Reconnection attempt ${connectionRetryCount}/${MAX_RETRY_ATTEMPTS}`
  );
  createConnection();
}

function startConnectionHealthMonitoring() {
  clearTimeout(connectionHealthTimer);
  connectionHealthTimer = setTimeout(() => {
    if (port) {
      try {
        // Send a ping to test connection
        port.postMessage({ type: 'ping' });
        startConnectionHealthMonitoring(); // Schedule next check
      } catch (error) {
        console.log(
          '[FireScope Panel] Connection health check failed, reconnecting...',
          error
        );
        reconnect();
      }
    }
  }, 30000); // Check every 30 seconds
}

// Initialize connection
createConnection();
const state = {
  requests: [],
  collections: new Map(), // name -> count
  filter: '',
};

const $ = s => document.querySelector(s);
const tpl = $('#requestTpl');
const root = $('#requests');
const empty = $('#empty');
const search = $('#search');
const searchClear = $('#searchClear');
const exportAll = $('#exportAll');
const clearBtn = $('#clear');
const collectionsToggle = $('#collectionsToggle');
const moreToggle = document.getElementById('moreToggle');
const collectionsCount = $('#collectionsCount');

// Initialize theme manager
const _themeManager = new ThemeManager();

// Initialize dropdown portal
const dropdownPortal = new DropdownPortal();

function render() {
  // Group requests by network request (groupId) if present
  const grouped = new Map();
  for (const r of state.requests) {
    const key = r.groupId || `${r.receivedAt}-${r.collectionPath || ''}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(r);
  }

  // Apply filter: keep group if any child matches
  const items = [];
  for (const [key, arr] of grouped.entries()) {
    const keep = !state.filter
      ? true
      : arr.some(r =>
          (r.collectionPath || '').toLowerCase().includes(state.filter)
        );
    if (keep) items.push({ key, children: arr });
  }

  root.innerHTML = '';
  if (items.length === 0) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
  }

  for (const group of items) {
    // Synthesize group-level fields from first child
    const first = group.children[0];
    const isMulti = group.children.length > 1;
    // Resolve Firebase Console project URL for nav buttons
    const _requestsWithFs = state.requests.filter(
      r => r.url && r.url.includes('firestore.googleapis.com')
    );
    const firebaseUrl =
      _requestsWithFs.length > 0 ? _requestsWithFs[0].url : null;
    const node = tpl.content.cloneNode(true);
    const methodEl = node.querySelector('.method');
    const collectionEl = node.querySelector('.collection');
    const metaEl = node.querySelector('.meta');
    const chipsEl = node.querySelector('.query-chips');
    const lineEl = node.querySelector('.line');

    const method = first.method || 'POST';
    methodEl.className = `method pill ${method}`;
    methodEl.innerHTML = `<span class="pill-icon">⇄</span>${method}`;

    if (!isMulti) {
      // Insert badges for single-query groups only
      const typeBadge = document.createElement('span');
      typeBadge.className = `badge ${getTypeBadgeClass(first.type)}`;
      typeBadge.innerHTML = `<span class="badge-icon">${getTypeBadgeIcon(first.type)}</span>${getTypeBadgeLabel(first.type)}`;
      lineEl.insertBefore(typeBadge, collectionEl);

      if (first.isCollectionGroup) {
        const groupBadge = document.createElement('span');
        groupBadge.className = 'badge type-group';
        groupBadge.title = 'Collection Group query';
        groupBadge.innerHTML = `<span class="badge-icon">${getGroupBadgeIcon()}</span>CG`;
        lineEl.insertBefore(groupBadge, collectionEl);
      }
    }

    // Keep badges + collection on the same line (move collection to end)
    lineEl.appendChild(collectionEl);

    if (isMulti) {
      collectionEl.textContent = '';
      collectionEl.style.display = 'none';
    } else {
      if (
        (first.type === 'doc_lookup' || first.type === 'document_lookup') &&
        Array.isArray(first.documents) &&
        first.documents.length > 0
      ) {
        const paths = first.documents
          .filter(d => d && d.collection && d.id)
          .map(d => `${d.collection}/${d.id}`);
        collectionEl.textContent = paths.length
          ? paths.join(', ')
          : first.collectionPath || '(unknown collection)';
      } else {
        collectionEl.textContent =
          first.collectionPath || '(unknown collection)';
      }
    }
    // Build grouped stats above the line
    if (metaEl) {
      // Clear any previous content (template is empty but safe to clear)
      metaEl.innerHTML = '';

      // Move method to stats row as a pill
      metaEl.appendChild(methodEl);

      // Duration
      const durationMs = first.durationMs != null ? first.durationMs : null;
      if (durationMs != null) {
        const durationEl = document.createElement('span');
        durationEl.className = 'pill duration';
        durationEl.innerHTML = `<span class="pill-icon">⏱</span>${durationMs}ms`;
        metaEl.appendChild(durationEl);
      }

      // Status
      if (first.status != null && first.status !== '') {
        const statusEl = document.createElement('span');
        let statusClass = 'status';
        const s = Number(first.status);
        if (!Number.isNaN(s)) {
          if (s >= 200 && s < 300) statusClass = 'status success';
          else if (s >= 400 && s < 500) statusClass = 'status error';
          else if (s >= 300 && s < 400) statusClass = 'status warning';
        }
        const statusIcon = statusClass.includes('success')
          ? '✅'
          : statusClass.includes('warning')
            ? '⚠️'
            : statusClass.includes('error')
              ? '❌'
              : 'ⓘ';
        statusEl.className = `${statusClass} pill`;
        statusEl.innerHTML = `<span class="pill-icon">${statusIcon}</span>${String(first.status)}`;
        metaEl.appendChild(statusEl);
      }

      // Query count (single query per entry in this view)
      const countEl = document.createElement('span');
      countEl.className = 'pill count';
      const qCount = group.children.length;
      countEl.innerHTML = `<span class="pill-icon">🔢</span>${qCount}`;
      metaEl.appendChild(countEl);

      // Root meta shows only verb, duration, status, and count
    }

    // Add per-query chips for multi-query groups with per-query menu
    if (chipsEl) {
      chipsEl.innerHTML = '';
      if (isMulti) {
        for (const q of group.children) {
          const chip = document.createElement('span');
          chip.className = `query-chip badge ${getTypeBadgeClass(q.type)}`;
          let label = q.collectionPath || 'unknown';
          if (
            (q.type === 'doc_lookup' || q.type === 'document_lookup') &&
            Array.isArray(q.documents) &&
            q.documents.length > 0
          ) {
            const paths = q.documents
              .filter(d => d && d.collection && d.id)
              .map(d => `${d.collection}/${d.id}`);
            if (paths.length) label = paths.join(', ');
          }
          chip.innerHTML = `<span class="badge-icon">${getTypeBadgeIcon(q.type)}</span>${getTypeBadgeLabel(q.type)} · ${label}`;
          chipsEl.appendChild(chip);
        }
      }
    }
    const details = node.querySelector('.details');

    // Build details: per-query blocks for multi; single otherwise
    details.innerHTML = '';
    if (isMulti) {
      group.children.forEach((q, idx) => {
        const block = document.createElement('div');
        block.className = 'query-detail-block';

        const hdr = document.createElement('div');
        hdr.className = 'query-detail-header';
        const tb = document.createElement('span');
        tb.className = `badge ${getTypeBadgeClass(q.type)}`;
        tb.innerHTML = `<span class="badge-icon">${getTypeBadgeIcon(q.type)}</span>${getTypeBadgeLabel(q.type)}`;
        const name = document.createElement('span');
        name.className = 'collection';
        name.style.marginLeft = '6px';
        if (
          (q.type === 'doc_lookup' || q.type === 'document_lookup') &&
          Array.isArray(q.documents) &&
          q.documents.length > 0
        ) {
          // Show collection/id for document lookups; if multiple, join by comma
          const paths = q.documents
            .filter(d => d && d.collection && d.id)
            .map(d => `${d.collection}/${d.id}`);
          name.textContent = paths.length
            ? paths.join(', ')
            : q.collectionPath || '(unknown collection)';
        } else {
          name.textContent = q.collectionPath || '(unknown collection)';
        }
        hdr.appendChild(tb);
        if (q.isCollectionGroup) {
          const cg = document.createElement('span');
          cg.className = 'badge type-group';
          cg.style.marginLeft = '4px';
          cg.innerHTML = `<span class="badge-icon">${getGroupBadgeIcon()}</span>CG`;
          hdr.appendChild(cg);
        }
        hdr.appendChild(name);

        // Add per-subquery actions (right-aligned): Export ▾ + View Details
        const subActions = document.createElement('div');
        subActions.className = 'sub-actions';
        subActions.style.marginLeft = 'auto';
        subActions.style.display = 'flex';
        subActions.style.gap = '8px';

        const subExport = document.createElement('button');
        subExport.className = 'exportBtn';
        subExport.textContent = 'Export ▾';
        subActions.appendChild(subExport);

        const subToggle = document.createElement('button');
        subToggle.className = 'toggleDetails';
        subToggle.textContent = 'View Details';
        subActions.appendChild(subToggle);

        hdr.appendChild(subActions);

        block.appendChild(hdr);

        // Hidden content container toggled by the sub button
        const subContent = document.createElement('div');
        subContent.style.display = 'none';

        if (Array.isArray(q.aggregations) && q.aggregations.length) {
          const aggWrap = document.createElement('div');
          aggWrap.className = 'agg-summary';
          const aggTitle = document.createElement('div');
          aggTitle.className = 'agg-title';
          aggTitle.textContent = 'Aggregations';
          aggWrap.appendChild(aggTitle);
          const list = document.createElement('ul');
          list.className = 'agg-list';
          q.aggregations.forEach(a => {
            const li = document.createElement('li');
            li.className = 'agg-item';
            let op = '';
            let field = '';
            if (a.count !== undefined) {
              op = 'COUNT';
            } else if (a.sum && a.sum.field) {
              op = 'SUM';
              field = a.sum.field?.fieldPath || a.sum.field;
            } else if (a.avg && a.avg.field) {
              op = 'AVG';
              field = a.avg.field?.fieldPath || a.avg.field;
            }
            const alias = a.alias || '';
            li.textContent = alias
              ? `${alias}: ${op}${field ? `(${field})` : ''}`
              : `${op}${field ? `(${field})` : ''}`;
            list.appendChild(li);
          });
          aggWrap.appendChild(list);
          subContent.appendChild(aggWrap);
        }

        const pre = document.createElement('pre');
        pre.className = 'code';
        pre.textContent = JSON.stringify(
          {
            type: q.type,
            collection: q.collectionPath,
            isCollectionGroup: !!q.isCollectionGroup,
            filters: q.filters || [],
            orderBy: q.orderBy || [],
            limit: typeof q.limit === 'number' ? q.limit : undefined,
            aggregations: Array.isArray(q.aggregations)
              ? q.aggregations
              : undefined,
            documents: Array.isArray(q.documents) ? q.documents : undefined,
          },
          null,
          2
        );
        subContent.appendChild(pre);
        block.appendChild(subContent);

        // Hook sub-export dropdown
        subExport.addEventListener('click', e => {
          e.stopPropagation();
          const menuItems = [
            {
              text: 'Copy as Angular',
              value: 'angular',
              onClick: () => {
                const code = QueryExporter.toAngular(q);
                copy(code);
                toast('Copied Angular code');
              },
            },
            {
              text: 'Copy as Node.js',
              value: 'node',
              onClick: () => {
                const code = QueryExporter.toNode(q);
                copy(code);
                toast('Copied Node.js code');
              },
            },
            {
              text: 'Copy as Flutter',
              value: 'flutter',
              onClick: () => {
                const code = QueryExporter.toFlutter(q);
                copy(code);
                toast('Copied Flutter code');
              },
            },
            {
              text: 'Copy as JSON',
              value: 'json',
              onClick: () => {
                const code = QueryExporter.toJSON(q);
                copy(code);
                toast('Copied JSON');
              },
            },
          ];
          dropdownPortal.openDropdown(subExport, menuItems);
        });

        subToggle.addEventListener('click', () => {
          const isHidden = subContent.style.display === 'none';
          subContent.style.display = isHidden ? 'block' : 'none';
          subToggle.textContent = isHidden ? 'Hide Details' : 'View Details';
        });

        // Per-subquery View in Console
        if (firebaseUrl) {
          let nav = null;
          if (
            (q.type === 'doc_lookup' || q.type === 'document_lookup') &&
            Array.isArray(q.documents) &&
            q.documents.length > 0
          ) {
            nav = createProcessorNavButton(firebaseUrl, q);
          } else {
            nav = createPanelNavButton(firebaseUrl, q);
          }
          if (nav && (nav.tagName === 'BUTTON' || nav.childNodes.length)) {
            subActions.appendChild(nav);
          }
        }

        if (idx < group.children.length - 1) {
          const hr = document.createElement('div');
          hr.style.height = '1px';
          hr.style.background = 'var(--border-subtle)';
          hr.style.margin = '12px 0';
          block.appendChild(hr);
        }

        details.appendChild(block);
      });
    } else {
      if (Array.isArray(first.aggregations) && first.aggregations.length) {
        const aggWrap = document.createElement('div');
        aggWrap.className = 'agg-summary';
        const aggTitle = document.createElement('div');
        aggTitle.className = 'agg-title';
        aggTitle.textContent = 'Aggregations';
        aggWrap.appendChild(aggTitle);
        const list = document.createElement('ul');
        list.className = 'agg-list';
        first.aggregations.forEach(a => {
          const li = document.createElement('li');
          li.className = 'agg-item';
          let op = '';
          let field = '';
          if (a.count !== undefined) {
            op = 'COUNT';
          } else if (a.sum && a.sum.field) {
            op = 'SUM';
            field = a.sum.field?.fieldPath || a.sum.field;
          } else if (a.avg && a.avg.field) {
            op = 'AVG';
            field = a.avg.field?.fieldPath || a.avg.field;
          }
          const alias = a.alias || '';
          li.textContent = alias
            ? `${alias}: ${op}${field ? `(${field})` : ''}`
            : `${op}${field ? `(${field})` : ''}`;
          list.appendChild(li);
        });
        aggWrap.appendChild(list);
        details.appendChild(aggWrap);
      }

      const pre = document.createElement('pre');
      pre.className = 'code';
      pre.textContent = JSON.stringify(
        {
          type: first.type,
          collection: first.collectionPath,
          isCollectionGroup: !!first.isCollectionGroup,
          filters: first.filters || [],
          orderBy: first.orderBy || [],
          limit: typeof first.limit === 'number' ? first.limit : undefined,
          aggregations: Array.isArray(first.aggregations)
            ? first.aggregations
            : undefined,
          documents: Array.isArray(first.documents)
            ? first.documents
            : undefined,
        },
        null,
        2
      );
      details.appendChild(pre);
    }

    // Toggle details with label swap
    const rootToggleBtn = node.querySelector('.toggleDetails');
    rootToggleBtn.addEventListener('click', () => {
      details.classList.toggle('show');
      const isShown = details.classList.contains('show');
      rootToggleBtn.textContent = isShown ? 'Hide Details' : 'View Details';
    });

    // Root export is only for single-query requests
    const actionsDiv = node.querySelector('.actions');
    const exportBtn = node.querySelector('.exportBtn');
    if (isMulti) {
      // Hide export on grouped requests (per-query export exists)
      if (exportBtn) exportBtn.style.display = 'none';
    } else if (exportBtn) {
      exportBtn.style.display = '';
      exportBtn.addEventListener('click', e => {
        e.stopPropagation();
        const currentForExport = first;
        const menuItems = [
          {
            text: 'Copy as Angular',
            value: 'angular',
            onClick: () => {
              const code = QueryExporter.toAngular(currentForExport);
              copy(code);
              toast('Copied Angular code');
            },
          },
          {
            text: 'Copy as React',
            value: 'react',
            onClick: () => {
              const code = QueryExporter.toReact(currentForExport);
              copy(code);
              toast('Copied React code');
            },
          },
          {
            text: 'Copy as Node.js',
            value: 'node',
            onClick: () => {
              const code = QueryExporter.toNode(currentForExport);
              copy(code);
              toast('Copied Node.js code');
            },
          },
          {
            text: 'Copy as Next.js (Client)',
            value: 'next-client',
            onClick: () => {
              const code = QueryExporter.toNextClient(currentForExport);
              copy(code);
              toast('Copied Next.js client code');
            },
          },
          {
            text: 'Copy as Next.js (Server)',
            value: 'next-server',
            onClick: () => {
              const code = QueryExporter.toNextServer(currentForExport);
              copy(code);
              toast('Copied Next.js server code');
            },
          },
          {
            text: 'Copy as Flutter',
            value: 'flutter',
            onClick: () => {
              const code = QueryExporter.toFlutter(currentForExport);
              copy(code);
              toast('Copied Flutter code');
            },
          },
          {
            text: 'Copy as JSON',
            value: 'json',
            onClick: () => {
              const code = QueryExporter.toJSON(currentForExport);
              copy(code);
              toast('Copied JSON');
            },
          },
        ];
        dropdownPortal.openDropdown(exportBtn, menuItems);
      });

      // Add View in Console when available
      if (firebaseUrl && actionsDiv) {
        let navButton = null;
        if (
          (first.type === 'doc_lookup' || first.type === 'document_lookup') &&
          Array.isArray(first.documents) &&
          first.documents.length > 0
        ) {
          navButton = createProcessorNavButton(firebaseUrl, first);
        } else {
          navButton = createPanelNavButton(firebaseUrl, first);
        }
        if (
          navButton &&
          (navButton.tagName === 'BUTTON' || navButton.childNodes.length)
        ) {
          actionsDiv.appendChild(navButton);
        }
      }
    }

    root.appendChild(node);
  }

  // Collections count
  collectionsCount.textContent = state.collections.size;
}

function copy(text) {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (successful) {
      console.log('[FireScope] Copied to clipboard');
    } else {
      console.log('[FireScope] Failed to copy to clipboard');
    }
  } catch (error) {
    console.log('[FireScope] Error copying to clipboard:', error);
  }
}

function toast(msg) {
  console.log('[FireScope]', msg);
}

search.addEventListener('keydown', e => {
  if ((e.key === 'f' || e.key === 'F') && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    search.focus();
  } else if (e.key === 'Escape') {
    search.value = '';
    state.filter = '';
    updateSearchClearButton();
    render();
  }
});
function updateSearchClearButton() {
  if (search.value.trim()) {
    searchClear.style.display = 'flex';
  } else {
    searchClear.style.display = 'none';
  }
}

search.addEventListener('input', () => {
  state.filter = search.value.trim().toLowerCase();
  updateSearchClearButton();
  render();
});

searchClear.addEventListener('click', () => {
  search.value = '';
  state.filter = '';
  updateSearchClearButton();
  render();
  search.focus();
});

exportAll.addEventListener('click', () => {
  const items = state.requests.filter(
    r =>
      !state.filter ||
      (r.collectionPath || '').toLowerCase().includes(state.filter)
  );
  const blob = new Blob([JSON.stringify(items, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  /* global URL */
  a.href = URL.createObjectURL(blob);
  a.download = 'firescope-export.json';
  a.click();
});

clearBtn.addEventListener('click', () => {
  state.requests = [];
  state.collections.clear();
  render();
});

// Collections dropdown using portal
collectionsToggle.addEventListener('click', e => {
  e.stopPropagation();

  const menuItems = [];

  if (state.collections.size === 0) {
    menuItems.push({
      text: 'No collections captured yet',
      value: 'empty',
      onClick: () => {}, // No action for empty state
    });
  } else {
    // Add "Clear filter" option if there's an active filter
    if (state.filter) {
      menuItems.push({
        text: '✕ Clear filter',
        value: 'clear',
        onClick: () => {
          state.filter = '';
          search.value = '';
          updateSearchClearButton();
          render();
        },
      });
    }

    [...state.collections.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, count]) => {
        const isCurrentlySelected = state.filter === name.toLowerCase();
        menuItems.push({
          text: `${name} × ${count}`,
          value: name,
          isSelected: isCurrentlySelected,
          onClick: () => {
            state.filter = name.toLowerCase();
            search.value = name;
            updateSearchClearButton();
            render();
          },
        });
      });
  }

  dropdownPortal.openDropdown(collectionsToggle, menuItems);
});

// More menu: theme toggle and links
if (moreToggle) {
  moreToggle.addEventListener('click', e => {
    e.stopPropagation();
    const items = getMoreMenuItems(_themeManager);
    dropdownPortal.openDropdown(moreToggle, items);
  });
}

function setupMessageListener() {
  port.onMessage.addListener(msg => {
    console.log('[FireScope Panel] Received message:', msg);
    if (msg.type === 'request') {
      console.log(
        '[FireScope Panel] Processing request with payload:',
        msg.payload
      );
      // Annotate with timestamps and defaults for consistent UI
      const now = Date.now();
      const hasStart = typeof msg.payload.startedAt === 'number';
      const hasEnd = typeof msg.payload.endedAt === 'number';
      const duration =
        typeof msg.payload.durationMs === 'number' ? msg.payload.durationMs : 0;
      const annotated = {
        ...msg.payload,
        receivedAt: now,
        startedAt: hasStart
          ? msg.payload.startedAt
          : duration
            ? now - duration
            : null,
        endedAt: hasEnd ? msg.payload.endedAt : duration ? now : null,
      };
      state.requests.push(annotated);
      if (msg.payload.collectionPath) {
        const key = msg.payload.collectionPath;
        state.collections.set(key, (state.collections.get(key) || 0) + 1);
        console.log('[FireScope Panel] Added to collection:', key);
      }
      render();
    } else if (msg.type === 'reset') {
      state.requests = [];
      state.collections.clear();
      render();
    } else if (msg.type === 'pong') {
      console.log('[FireScope Panel] Connection health confirmed');
    }
  });
}

// Cleanup portal and connection on page unload
window.addEventListener('beforeunload', () => {
  dropdownPortal.destroy();
  clearTimeout(connectionHealthTimer);
  if (port) {
    try {
      port.disconnect();
    } catch (error) {
      console.log(
        '[FireScope Panel] Error disconnecting port on unload:',
        error
      );
    }
  }
});

// No local normalization needed; handled in console-link-utils

// Operator and timestamp helpers are centralized in console-link-utils.js

render();

function getTypeBadgeLabel(type) {
  switch (type) {
    case 'aggregation_query':
      return 'AGG';
    case 'doc_lookup':
      return 'LOOKUP';
    case 'write_operation':
      return 'WRITE';
    case 'structured_query':
    default:
      return 'FETCH';
  }
}

function getTypeBadgeClass(type) {
  switch (type) {
    case 'aggregation_query':
      return 'type-aggregation';
    case 'doc_lookup':
      return 'type-lookup';
    case 'write_operation':
      return 'type-write';
    case 'structured_query':
    default:
      return 'type-fetch';
  }
}

function getTypeBadgeIcon(type) {
  switch (type) {
    case 'aggregation_query':
      return '∑';
    case 'doc_lookup':
      return '🔎';
    case 'write_operation':
      return '✍️';
    case 'structured_query':
    default:
      return '🔍';
  }
}

function getGroupBadgeIcon() {
  return '🗂️';
}

function getTypeBadgeTooltip(type) {
  switch (type) {
    case 'aggregation_query':
      return 'Aggregation query (count/sum/avg)';
    case 'doc_lookup':
      return 'Document lookup';
    case 'write_operation':
      return 'Write operation';
    case 'structured_query':
    default:
      return 'Structured query (fetch)';
  }
}
// Resolve Firebase Console URL base from any captured request
const requestsWithFs = state.requests.filter(
  r => r.url && r.url.includes('firestore.googleapis.com')
);
const firebaseUrl = requestsWithFs.length > 0 ? requestsWithFs[0].url : null;
