/*
 * FireScope - Real-time Firestore Monitoring Extension
 * Copyright (C) 2025 Omar Dulaimi
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { CONFIG, DOM } from './config.js';
import { QueryExporter } from './query-exporter.js';
import { createProcessorNavButton } from '#nav-button';

function throttle(func, delay) {
  let lastCall = 0;
  return function (...args) {
    const now = new Date().getTime();
    if (now - lastCall < delay) {
      return;
    }
    lastCall = now;
    return func.apply(this, args);
  };
}

/**
 * Processes requests, extracts query information, and updates UI
 */
export class RequestProcessor {
  constructor(stateManager) {
    this.state = stateManager;
    this.throttledUpdateRequestQueries = throttle(
      this.updateRequestQueries.bind(this),
      100
    );
  }

  /**
   * Parse a query string into structured data
   */
  parseQueryString(queryString) {
    if (!queryString) return { clauses: [] };

    const parts = queryString.split('|');
    const numClauses = parseInt(parts[0]);
    let currentIndex = 1;
    const clauses = [];

    for (let i = 0; i < numClauses; i++) {
      const clauseParts = parts[currentIndex].split('|');
      const clauseType = clauseParts[0];

      switch (clauseType) {
        case 'WH': {
          const [propertyName, _propertyLength] = this._parseStringWithLength(
            clauseParts[2]
          );
          const operator = this._reverseOperatorCode(clauseParts[3]);
          const valueType = clauseParts[4];
          let value;

          switch (valueType) {
            case 'BL':
              value = clauseParts[5].split('/')[1] === 'true';
              break;
            case 'NUM':
              value = parseInt(clauseParts[5].split('/')[1]);
              break;
            case 'TS':
              value = clauseParts[5].split('/')[1];
              break;
            case 'ARR': {
              const [_arrayLength, ...arrayValues] = clauseParts[5].split('/');
              value = arrayValues.map(val => {
                const [type, _length, actualValue] = val.split('/');
                switch (type) {
                  case 'BL':
                    return actualValue === 'true';
                  case 'NUM':
                    return parseInt(actualValue);
                  case 'TS':
                    return actualValue;
                  default:
                    return actualValue;
                }
              });
              break;
            }
            default:
              value = clauseParts[5].split('/')[1];
          }

          clauses.push({
            type: 0,
            propertyFilters: [
              {
                propertyName,
                operator,
                value,
              },
            ],
          });
          break;
        }

        case 'ORD': {
          const [propertyName] = this._parseStringWithLength(clauseParts[1]);
          const direction =
            clauseParts[2] === 'ASC' ? 'ASCENDING' : 'DESCENDING';

          clauses.push({
            type: 1,
            propertyName,
            direction,
          });
          break;
        }

        case 'COU':
          clauses.push({ type: 3 });
          break;

        case 'SUM': {
          const [propertyName] = this._parseStringWithLength(clauseParts[1]);
          clauses.push({
            type: 4,
            propertyName,
          });
          break;
        }

        case 'AVG': {
          const [propertyName] = this._parseStringWithLength(clauseParts[1]);
          clauses.push({
            type: 5,
            propertyName,
          });
          break;
        }
      }

      currentIndex++;
    }

    return { clauses };
  }

  /**
   * Helper to parse a string with length prefix
   */
  _parseStringWithLength(str) {
    const [lengthStr, ...rest] = str.split('/');
    const value = rest.join('/');
    return [value, parseInt(lengthStr)];
  }

  /**
   * Reverse map an operator code to the full operator
   */
  _reverseOperatorCode(code) {
    const map = {
      EQ: 'EQUAL',
      NEQ: 'NOT_EQUAL',
      LT: 'LESS_THAN',
      LTE: 'LESS_THAN_OR_EQUAL',
      GT: 'GREATER_THAN',
      GTE: 'GREATER_THAN_OR_EQUAL',
      AC: 'ARRAY_CONTAINS',
      IN: 'IN',
      NIN: 'NOT_IN',
      ACA: 'ARRAY_CONTAINS_ANY',
    };
    return map[code] || 'EQUAL';
  }

  // Navigation button is provided via alias; non-URL editions return a stub
  createNavigationButton(url, queryInfo) {
    return createProcessorNavButton(url, queryInfo);
  }

  /**
   * Format a duration in milliseconds to a human-readable string
   */
  formatDuration(ms) {
    return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;
  }

  /**
   * Handle an incoming request
   */
  handleRequest(request) {
    if (!request.url?.includes(CONFIG.TARGET_URL)) return;

    const requestGroups = this.parseRequestBody(request);
    if (!requestGroups) return;

    let activeRequest = this.state.activeRequests.get(request.requestId);
    if (!activeRequest) {
      activeRequest = this.createNewRequest(request);
      this.state.addRequest(activeRequest);
      this.createRequestContainer(activeRequest);
    }

    activeRequest.queries.push(...requestGroups);
    this.throttledUpdateRequestQueries(activeRequest);
  }

  /**
   * Handle new format request from background.js
   */
  handleNewFormatRequest(payload) {
    // Generate a unique request ID based on timestamp and random value
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create request structure similar to old format
    const request = {
      requestId: requestId,
      url:
        payload.url ||
        'https://firestore.googleapis.com/v1/projects/unknown/databases/(default)/documents',
      method: payload.method || 'POST',
      timeStamp: Date.now(),
    };

    // Convert new payload format to old request groups format
    const requestGroup = {
      'Request details': {
        type: payload.type || 'structured_query',
        collection: payload.collectionPath,
        filters: payload.filters || [],
        orderBy: payload.orderBy || [],
        isCollectionGroup: payload.isCollectionGroup || false,
        status: payload.status,
        durationMs: payload.durationMs,
      },
    };

    let activeRequest = this.state.activeRequests.get(requestId);
    if (!activeRequest) {
      activeRequest = this.createNewRequest(request);
      this.state.addRequest(activeRequest);
      this.createRequestContainer(activeRequest);
    }

    // Add the converted request group
    activeRequest.queries.push(requestGroup);

    // Update timing info if available
    if (payload.status && payload.durationMs !== null) {
      this.updateRequestTimingFromPayload(activeRequest, payload);
    }

    this.throttledUpdateRequestQueries(activeRequest);
  }

  /**
   * Create a new request object
   */
  createNewRequest(request) {
    return {
      requestId: request.requestId,
      url: request.url,
      method: request.method,
      timeStamp: request.timeStamp,
      queries: [],
    };
  }

  /**
   * Update request timing information in the UI
   */
  updateRequestTiming(timingInfo) {
    const requestDiv = document.querySelector(
      `[data-request-id="${timingInfo.requestId}"]`
    );
    if (!requestDiv) return;

    const timingDiv = requestDiv.querySelector('.request-timing');
    if (!timingDiv) return;

    const duration = this.formatDuration(timingInfo.timing.duration);
    const queryCount = this.getQueryCount(timingInfo.requestId);
    const statusClass = timingInfo.status < 400 ? 'success' : 'error';

    timingDiv.innerHTML = `
      <div class="timing-info">
        <span class="timing-label">Duration:</span> 
        <span class="timing-value">${duration}</span>
        <span class="timing-label">Status:</span> 
        <span class="timing-value ${statusClass}">${timingInfo.status}</span>
        <span class="timing-label">Queries:</span> 
        <span class="timing-value">${queryCount}</span>
      </div>
    `;
  }

  /**
   * Get the query count for a request
   */
  getQueryCount(requestId) {
    const request = this.state.activeRequests.get(requestId);
    return request ? request.queries.length : 0;
  }

  /**
   * Create the request container in the UI
   */
  createRequestContainer(request) {
    const requestDiv = document.createElement('div');
    requestDiv.className = 'request-container';
    requestDiv.setAttribute('data-request-id', request.requestId);

    const headerDiv = document.createElement('div');
    headerDiv.className = 'header-container';

    const methodSpan = document.createElement('span');
    methodSpan.className = `method ${request.method}`;
    methodSpan.textContent = request.method;

    const urlDiv = document.createElement('div');
    urlDiv.className = 'url';
    urlDiv.textContent = request.url;

    const timingDiv = document.createElement('div');
    timingDiv.className = 'request-timing';
    timingDiv.innerHTML = `
      <div class="timing-info">
        <span class="timing-label">Started:</span> 
        <span class="timing-value">${new Date(
          request.timeStamp
        ).toLocaleTimeString()}</span>
        <span class="timing-label">Status:</span> 
        <span class="timing-value">Pending...</span>
        <span class="timing-label">Queries:</span>
        <span class="timing-value">0</span>
      </div>
    `;

    headerDiv.appendChild(methodSpan);
    headerDiv.appendChild(urlDiv);
    headerDiv.appendChild(timingDiv);
    requestDiv.appendChild(headerDiv);

    const queriesContainer = document.createElement('div');
    queriesContainer.className = 'queries-container';
    requestDiv.appendChild(queriesContainer);

    DOM.requestsContainer.insertBefore(
      requestDiv,
      DOM.requestsContainer.firstChild
    );

    // Apply current search filter to new request after DOM insertion
    setTimeout(() => {
      this.state.searchManager?.filterNewRequest(requestDiv);
    }, 0);
  }

  /**
   * Update the queries display for a request
   */
  updateRequestQueries(request) {
    const requestDiv = document.querySelector(
      `[data-request-id="${request.requestId}"]`
    );
    if (!requestDiv) return;

    const queriesContainer = requestDiv.querySelector('.queries-container');

    // Check if we've already processed these queries to avoid duplicate counting
    const currentQueryCount = queriesContainer.children.length;
    const newQueries = request.queries.slice(currentQueryCount);

    // Only process new queries
    if (newQueries.length === 0) return;

    // PERFORMANCE FIX: Use DocumentFragment for batch DOM operations
    const fragment = document.createDocumentFragment();

    // PERFORMANCE FIX: Limit the number of queries displayed
    const queriesToDisplay = newQueries.slice(0, 200 - currentQueryCount); // Display max 200 queries total

    queriesToDisplay.forEach(query => {
      const queryDiv = document.createElement('div');
      queryDiv.className = 'query-container';

      const queryInfo = this.extractQuery(query);
      if (queryInfo) {
        // Track collections only for new queries
        if (queryInfo.type === 'document_lookup') {
          queryInfo.documents.forEach(doc =>
            this.state.addCollection(doc.collection)
          );
        } else {
          this.state.addCollection(queryInfo.collection);
        }

        queryDiv.appendChild(this.createQueryHeader(queryInfo));
      }

      // Create a stylized "View Details" button
      const viewDetailsButton = document.createElement('button');
      viewDetailsButton.className = 'view-details-button';
      viewDetailsButton.innerHTML = `
        <svg class="details-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 6V12L16 14M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" 
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        View Details
      `;

      // Create query content container (initially hidden)
      const queryContent = document.createElement('div');
      queryContent.className = 'query-content hidden';

      // Toggle functionality for the button
      viewDetailsButton.addEventListener('click', () => {
        queryContent.classList.toggle('hidden');

        // Update button text and icon based on state
        if (queryContent.classList.contains('hidden')) {
          viewDetailsButton.innerHTML = `
            <svg class="details-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 6V12L16 14M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" 
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            View Details
          `;
        } else {
          // Only create JSON viewer when showing details for the first time
          if (!queryContent.querySelector('.json-viewer')) {
            queryContent.appendChild(this.createJsonViewer(query));
          }

          viewDetailsButton.innerHTML = `
            <svg class="details-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 9L12 16L5 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Hide Details
          `;
        }
      });

      queryDiv.appendChild(viewDetailsButton);
      queryDiv.appendChild(queryContent);
      fragment.appendChild(queryDiv);
    });

    // Append only new elements
    queriesContainer.appendChild(fragment);

    this.updateTimingInfo(requestDiv, request.queries.length);

    // Re-apply search filter after adding new queries
    if (this.state.searchManager?.getCurrentFilter()) {
      setTimeout(() => {
        this.state.searchManager.filterNewRequest(requestDiv);
      }, 0);
    }
  }

  /**
   * Create a query header for the UI
   */
  createQueryHeader(queryInfo) {
    const queryHeader = document.createElement('div');
    queryHeader.className = 'query-header';

    // Get the request details
    const requestDetails = queryInfo;
    // Get URL from any active request since they should all have the same project
    const currentRequest = Array.from(this.state.activeRequests.values())[0];
    const url = currentRequest?.url;

    // Project ID available if needed for future use

    if (requestDetails.type === 'document_lookup') {
      const docs = requestDetails.documents
        .map(doc => `${doc.collection}/${doc.id}`)
        .join(', ');

      const headerContent = document.createElement('div');
      headerContent.className = 'collection-name';

      const typeBadge = document.createElement('span');
      typeBadge.className = 'query-type-badge query-type-lookup';
      typeBadge.textContent = 'LOOKUP';

      const collectionPath = document.createElement('span');
      collectionPath.className = 'collection-path';
      collectionPath.textContent = docs;

      headerContent.appendChild(typeBadge);
      headerContent.appendChild(collectionPath);
      queryHeader.appendChild(headerContent);

      // Add navigation button for document lookup
      if (url) {
        const navButton = this.createNavigationButton(url, requestDetails);
        queryHeader.appendChild(navButton);
      }
    } else {
      const headerContent = document.createElement('div');
      headerContent.className = 'collection-name';

      // Determine query type and styling based on the request details
      let queryType = '';
      let queryTypeClass = '';

      switch (requestDetails.type) {
        case 'create':
          queryType = 'CREATE';
          queryTypeClass = 'query-type-create';
          break;
        case 'update':
          queryType = 'UPDATE';
          queryTypeClass = 'query-type-update';
          break;
        case 'delete':
          queryType = 'DELETE';
          queryTypeClass = 'query-type-delete';
          break;
        case 'aggregation_query':
          queryType = 'AGGREGATION';
          queryTypeClass = 'query-type-aggregation';
          break;
        case 'write_operation':
          if (requestDetails.documentId) {
            queryType = 'WRITE';
            queryTypeClass = 'query-type-update';
          } else {
            queryType = 'FETCH';
            queryTypeClass = 'query-type-fetch';
          }
          break;
        default:
          queryType = 'FETCH';
          queryTypeClass = 'query-type-fetch';
      }

      const typeBadge = document.createElement('span');
      typeBadge.className = `query-type-badge ${queryTypeClass}`;
      typeBadge.textContent = queryType;

      const collectionPath = document.createElement('span');
      collectionPath.className = 'collection-path';
      collectionPath.textContent = requestDetails.collection;

      headerContent.appendChild(typeBadge);
      headerContent.appendChild(collectionPath);
      queryHeader.appendChild(headerContent);

      // Add navigation button for collection
      if (url) {
        const navButton = this.createNavigationButton(url, requestDetails);
        queryHeader.appendChild(navButton);
      }
    }

    // Add export dropdown
    const exportContainer = document.createElement('div');
    exportContainer.className = 'export-container';

    // Create export button
    const exportButton = document.createElement('button');
    exportButton.className = 'export-button';
    exportButton.innerHTML = `
    <svg class="export-icon" viewBox="0 0 24 24" width="16" height="16">
      <path fill="currentColor" d="M5,20H19V18H5V20M19,9H15V3H9V9H5L12,16L19,9Z"/>
    </svg>
    <span>Export</span>
    <svg class="chevron-icon" viewBox="0 0 24 24" width="16" height="16">
      <path fill="currentColor" d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z"/>
    </svg>
  `;

    // Create dropdown menu
    const dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'export-dropdown-menu';

    // Initialize query exporter
    const queryExporter = new QueryExporter();

    // Add Angular Fire option
    const angularFireOption = document.createElement('div');
    angularFireOption.className = 'export-option';
    angularFireOption.textContent = 'Copy as Angular Fire';
    angularFireOption.onclick = e => {
      e.stopPropagation();
      const code = queryExporter.exportAsAngularFire(requestDetails);
      this.copyToClipboard(code, exportButton);
      dropdownMenu.classList.remove('visible');
    };
    dropdownMenu.appendChild(angularFireOption);

    // Add Flutter option
    const flutterOption = document.createElement('div');
    flutterOption.className = 'export-option';
    flutterOption.textContent = 'Copy as Flutter';
    flutterOption.onclick = e => {
      e.stopPropagation();
      const code = queryExporter.exportAsFlutter(requestDetails);
      this.copyToClipboard(code, exportButton);
      dropdownMenu.classList.remove('visible');
    };
    dropdownMenu.appendChild(flutterOption);

    // Add JSON option
    const jsonOption = document.createElement('div');
    jsonOption.className = 'export-option';
    jsonOption.textContent = 'Copy as JSON';
    jsonOption.onclick = e => {
      e.stopPropagation();
      const copyText = JSON.stringify(requestDetails, null, 2);
      this.copyToClipboard(copyText, exportButton);
      dropdownMenu.classList.remove('visible');
    };
    dropdownMenu.appendChild(jsonOption);

    // Add Node.js option
    const nodeJsOption = document.createElement('div');
    nodeJsOption.className = 'export-option';
    nodeJsOption.textContent = 'Copy as Node.js';
    nodeJsOption.onclick = e => {
      e.stopPropagation();
      const code = queryExporter.exportAsNodeJs(queryInfo);
      this.copyToClipboard(code, exportButton);
      dropdownMenu.classList.remove('visible');
    };
    dropdownMenu.appendChild(nodeJsOption);

    // Toggle dropdown on click
    exportButton.onclick = e => {
      e.stopPropagation();
      dropdownMenu.classList.toggle('visible');

      document.addEventListener('click', function closeDropdown(event) {
        if (
          !exportButton.contains(event.target) &&
          !dropdownMenu.contains(event.target)
        ) {
          dropdownMenu.classList.remove('visible');
          document.removeEventListener('click', closeDropdown);
        }
      });
    };

    exportContainer.appendChild(exportButton);
    exportContainer.appendChild(dropdownMenu);
    queryHeader.appendChild(exportContainer);

    return queryHeader;
  }

  /**
   * Set up header content for a query
   */
  setupHeaderContent(header, content, isDocLookup, queryInfo = null) {
    const collectionName = document.createElement('div');
    collectionName.className = 'collection-name';
    collectionName.textContent = isDocLookup
      ? `Document Lookup: ${content}`
      : `Collection: ${content}`;
    header.appendChild(collectionName);

    const copyButton = document.createElement('button');
    copyButton.className = 'export-button';
    copyButton.textContent = isDocLookup ? 'Copy Path' : 'Copy Query';

    copyButton.onclick = () => {
      const copyText = isDocLookup
        ? content
        : JSON.stringify(queryInfo, null, 2);
      this.copyToClipboard(copyText, copyButton);
    };

    header.appendChild(copyButton);
  }

  /**
   * Copy text to clipboard and update button text
   */
  copyToClipboard(text, button) {
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
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
        this.state.notificationManager?.success(
          'Code copied to clipboard',
          2000
        );
      } else {
        throw new Error('Copy command failed');
      }
    } catch (_error) {
      this.state.notificationManager?.error('Failed to copy to clipboard');
      button.textContent = 'Copy Failed';
      setTimeout(() => {
        button.textContent =
          button.getAttribute('data-original-text') || 'Copy';
      }, 2000);
    }
  }

  /**
   * Update timing info in the UI
   */
  updateTimingInfo(requestDiv, queryCount) {
    const timingDiv = requestDiv.querySelector('.request-timing');
    const queryCountSpan = timingDiv.querySelector('.timing-value:last-child');
    if (queryCountSpan) {
      queryCountSpan.textContent = queryCount;
    }
  }

  /**
   * Update request timing from new payload format
   */
  updateRequestTimingFromPayload(activeRequest, payload) {
    const requestDiv = document.querySelector(
      `[data-request-id="${activeRequest.requestId}"]`
    );
    if (!requestDiv) return;

    const timingDiv = requestDiv.querySelector('.request-timing');
    if (!timingDiv) return;

    const duration = this.formatDuration(payload.durationMs);
    const queryCount = activeRequest.queries.length;
    const statusClass = payload.status < 400 ? 'success' : 'error';

    timingDiv.innerHTML = `
      <div class="timing-info">
        <span class="timing-label">Duration:</span> 
        <span class="timing-value">${duration}</span>
        <span class="timing-label">Status:</span> 
        <span class="timing-value ${statusClass}">${payload.status}</span>
        <span class="timing-label">Queries:</span> 
        <span class="timing-value">${queryCount}</span>
      </div>
    `;
  }

  /**
   * Extract query information from response data
   */
  extractQuery(data) {
    const firstRequest = Object.values(data)[0];
    if (!firstRequest) return null;

    if (firstRequest.type === 'document_lookup') {
      return {
        type: 'document_lookup',
        documents: firstRequest.documents.map(doc => ({
          collection: doc.collection || doc.id.split('/')[0],
          id: doc.id,
        })),
      };
    }

    // Access the request details - handle both direct properties and nested "Request details"
    const requestDetails = firstRequest['Request details'] || firstRequest;

    // Make sure we preserve all the necessary properties
    const result = {
      type: requestDetails.type || 'structured_query',
      collection: requestDetails.collection,
      filters: requestDetails.filters,
      orderBy: requestDetails.orderBy,
      aggregations: requestDetails.aggregations || [],
      isCollectionGroup: requestDetails.isCollectionGroup || false, // Always include this flag
    };

    return result;
  }

  /**
   * Create a JSON viewer for the UI
   */
  // In request-processor.js
  createJsonViewer(data) {
    const container = document.createElement('div');
    container.className = 'json-viewer';

    // PERFORMANCE FIX: Limit initial depth
    const _MAX_INITIAL_DEPTH = 2;

    const createNode = (key, value, depth = 0) => {
      const node = document.createElement('div');
      node.style.marginLeft = `${depth * 3}px`;

      if (typeof value === 'object' && value !== null) {
        const button = this.createCollapsibleButton(key, value, depth);

        // PERFORMANCE FIX: Only create content for shallow levels initially
        const content =
          // depth < MAX_INITIAL_DEPTH?
          this.createContentContainer(value, depth, createNode);

        // : this.createLazyContentContainer(key, value, depth, createNode);

        node.appendChild(button);
        node.appendChild(content);
      } else {
        node.innerHTML = `<span class="json-key">${key}</span>: <span class="json-value">${JSON.stringify(
          value
        )}</span>`;
      }

      return node;
    };

    // PERFORMANCE FIX: Only process top-level entries initially
    const topLevelEntries = Object.entries(data).slice(0, 20); // Limit to first 20 properties
    topLevelEntries.forEach(([key, value]) => {
      container.appendChild(createNode(key, value));
    });

    // Add indicator if more properties exist
    if (Object.keys(data).length > 20) {
      const moreIndicator = document.createElement('div');
      moreIndicator.className = 'more-properties';
      moreIndicator.textContent = `... ${
        Object.keys(data).length - 20
      } more properties`;
      container.appendChild(moreIndicator);
    }

    return container;
  }

  // New method for lazy content creation
  createLazyContentContainer(key, value, depth, createNodeFn) {
    const content = document.createElement('div');
    content.className = 'json-content';

    // Add a placeholder with load-on-click
    const placeholder = document.createElement('div');
    placeholder.className = 'lazy-content-placeholder';
    placeholder.textContent = `Click to load ${
      Array.isArray(value)
        ? value.length + ' items'
        : Object.keys(value).length + ' properties'
    }`;

    placeholder.onclick = () => {
      content.innerHTML = '';
      Object.entries(value).forEach(([k, v]) => {
        if (k !== 'collection') {
          const childNode = createNodeFn(k, v, depth + 1);
          if (childNode) content.appendChild(childNode);
        }
      });

      const closing = document.createElement('div');
      closing.style.marginLeft = `${depth * 3}px`;
      closing.textContent = Array.isArray(value) ? ']' : '}';
      content.appendChild(closing);
    };

    content.appendChild(placeholder);
    return content;
  }

  /**
   * Create a collapsible button for the JSON viewer
   */
  createCollapsibleButton(key, value, depth) {
    const button = document.createElement('div');
    button.className = 'collapsible';

    const expandButton = document.createElement('span');
    expandButton.className = 'expand-button';
    expandButton.textContent =
      depth < CONFIG.INITIAL_EXPANDED_DEPTH ? '-' : '+';
    button.appendChild(expandButton);

    const isArray = Array.isArray(value);
    button.appendChild(
      document.createTextNode(`${key}: ${isArray ? '[' : '{'}`)
    );

    button.addEventListener('click', function () {
      const content = this.nextElementSibling;
      expandButton.textContent = expandButton.textContent === '+' ? '-' : '+';
      content.classList.toggle('visible');
    });

    return button;
  }

  /**
   * Create a content container for the JSON viewer
   */
  createContentContainer(value, depth, createNodeFn) {
    const content = document.createElement('div');
    content.className =
      depth < CONFIG.INITIAL_EXPANDED_DEPTH
        ? 'json-content visible'
        : 'json-content';

    Object.entries(value).forEach(([k, v]) => {
      if (k !== 'collection') {
        const childNode = createNodeFn(k, v, depth + 1);
        if (childNode) content.appendChild(childNode);
      }
    });

    const closing = document.createElement('div');
    closing.style.marginLeft = `${depth * 3}px`;
    closing.textContent = Array.isArray(value) ? ']' : '}';
    content.appendChild(closing);

    return content;
  }

  /**
   * Parse request body data
   */
  parseRequestBody(request) {
    if (request.requestBody?.raw) {
      return this.parseRawBody(request);
    }

    if (!request.requestBody?.formData) return null;

    if (request.url.includes('/Write/')) {
      return this.parseWriteOperation(request);
    }

    return this.parseStructuredQuery(request);
  }

  /**
   * Parse raw request body
   */
  parseRawBody(request) {
    try {
      const aggregationQuery = request.requestBody.raw[0].bytes;

      if (aggregationQuery.structuredAggregationQuery) {
        return this.parseAggregationQuery(
          aggregationQuery.structuredAggregationQuery
        );
      }

      // Handle structured queries
      if (aggregationQuery.structuredQuery) {
        return [
          {
            'Request details': {
              type: 'structured_query',
              collection: aggregationQuery.structuredQuery.from[0].collectionId,
              filters: aggregationQuery.structuredQuery.where
                ? this.parseFilters(aggregationQuery.structuredQuery.where)
                : [],
              orderBy: aggregationQuery.structuredQuery.orderBy
                ? this.parseOrderBy(aggregationQuery.structuredQuery.orderBy)
                : [],
              isCollectionGroup:
                aggregationQuery.structuredQuery.from[0].allDescendants ===
                true,
            },
          },
        ];
      }
    } catch (_e) {
      // Silent error handling for structured query parsing
    }
    return null;
  }

  /**
   * Parse an aggregation query
   */
  parseAggregationQuery(queryData) {
    // Check if this is a collection group query
    const isCollectionGroup =
      queryData.structuredQuery?.from?.[0]?.allDescendants === true;

    return [
      {
        'Request details': {
          type: 'aggregation_query',
          collection: queryData.structuredQuery.from[0].collectionId,
          aggregations: queryData.aggregations,
          filters: this.parseFilters(queryData.structuredQuery.where),
          orderBy: this.parseOrderBy(queryData.structuredQuery.orderBy),
          isCollectionGroup: isCollectionGroup, // Add this flag for aggregation queries
        },
      },
    ];
  }

  /**
   * Parse filters from query data
   */
  parseFilters(where) {
    const filters = where?.compositeFilter?.filters || [];
    if (where?.fieldFilter) {
      filters.push({
        fieldFilter: where?.fieldFilter,
      });
    }

    return filters.map(filter => {
      const field = filter.fieldFilter.field.fieldPath;
      const op =
        CONFIG.OPERATOR_MAP[filter.fieldFilter.op] || filter.fieldFilter.op;
      const value = this.formatValue(filter.fieldFilter.value);

      // Infer type based on operator
      let type = typeof value;
      if (op === 'array-contains' || op === 'array-contains-any') {
        type = `array<${typeof value}>`;
      }

      return {
        field,
        op,
        value,
        type, // Include inferred type
      };
    });
  }

  /**
   * Parse order by clauses from query data
   */
  parseOrderBy(orderBy) {
    if (!orderBy) return undefined;

    return orderBy.map(order => ({
      field: order.field.fieldPath,
      direction: order.direction,
    }));
  }

  /**
   * Parse a write operation
   */
  parseWriteOperation(request) {
    if (!request.requestBody?.formData) return null;

    try {
      const entries = Object.entries(request.requestBody.formData);
      for (const [key, value] of entries) {
        if (key.includes('data')) {
          const parsedValue = JSON.parse(decodeURIComponent(value[0]));

          if (parsedValue.writes) {
            return parsedValue.writes.map(write => {
              const operation = {
                'Request details': { type: 'write_operation' },
              };

              if (write.update && write.currentDocument.exists === false) {
                write.create = write.update;
                delete write.update;
              }

              if (write.delete) {
                const { collection, id } = this.parseDocumentPath(write.delete);
                operation['Request details'] = {
                  type: 'delete',
                  collection,
                  documentId: id,
                };
              } else if (write.update) {
                const { collection, id } = this.parseDocumentPath(
                  write.update.name
                );
                operation['Request details'] = {
                  type: 'update',
                  collection,
                  documentId: id,
                  fields: this.formatFields(write.update.fields),
                };
              } else if (write.create) {
                const { collection, id } = this.parseDocumentPath(
                  write.create.name
                );
                operation['Request details'] = {
                  type: 'create',
                  collection,
                  documentId: id,
                  fields: this.formatFields(write.create.fields),
                };
              }

              return operation;
            });
          }
        }
      }
    } catch (_e) {
      // Silent error handling for JSON parsing and write operation processing
    }
    return null;
  }

  /**
   * Parse a document path
   */
  parseDocumentPath(path) {
    const parts = path.split('/');
    return {
      collection: parts[parts.length - 2],
      id: parts[parts.length - 1],
    };
  }

  /**
   * Format fields from Firestore data
   */
  formatFields(fields) {
    return Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        this.formatValue(value),
      ])
    );
  }

  /**
   * Format a value from Firestore
   */
  formatValue(valueObj) {
    const valueType = Object.keys(valueObj)[0];
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
        return value.values ? value.values.map(v => this.formatValue(v)) : [];
      case 'mapValue':
        return value.fields ? this.formatFields(value.fields) : {};
      default:
        return value;
    }
  }

  /**
   * Parse a structured query
   */
  parseStructuredQuery(request) {
    const requestGroups = {};
    const entries = Object.entries(request.requestBody.formData);

    for (const [key, value] of entries) {
      if (!key.includes('data')) continue;

      try {
        const parsedValue = JSON.parse(value[0]);
        const groupMatch = key.match(/req(\d+)/);
        if (!groupMatch) continue;

        const groupNum = groupMatch[1];

        if (parsedValue.addTarget?.documents) {
          requestGroups[groupNum] = this.parseDocumentLookup(
            parsedValue.addTarget.documents
          );
          continue;
        }

        if (parsedValue.addTarget?.query?.structuredQuery) {
          requestGroups[groupNum] = this.parseQuery(
            parsedValue.addTarget.query.structuredQuery
          );
        }
      } catch (_e) {
        // Silent error handling for JSON parsing in structured query processing
      }
    }

    const validGroups = Object.values(requestGroups).filter(
      group => Object.keys(group).length > 0
    );
    return validGroups.length > 0 ? validGroups : null;
  }

  /**
   * Parse a document lookup
   */
  parseDocumentLookup(documents) {
    return {
      'Request details': {
        type: 'document_lookup',
        documents: documents.documents.map(docPath => {
          const pathParts = docPath.split('/');
          const collectionIndex = pathParts.indexOf('documents') + 1;
          return {
            collection: pathParts[collectionIndex],
            id: pathParts[collectionIndex + 1],
          };
        }),
      },
    };
  }

  /**
   * Parse a query
   */
  parseQuery(queryData) {
    // Check if this is a collection group query
    const isCollectionGroup = queryData.from?.[0]?.allDescendants === true;

    const result = {
      'Request details': {
        type: 'structured_query',
        collection: queryData.from[0].collectionId,
        filters: queryData.where ? this.parseFilters(queryData.where) : [],
        isCollectionGroup: isCollectionGroup, // Add this flag
      },
    };

    if (queryData.orderBy) {
      result['Request details'].orderBy = this.parseOrderBy(queryData.orderBy);
    }

    return result;
  }
}
