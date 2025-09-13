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

import { DOM } from './config.js';

/**
 * Manages application state
 */
export class StateManager {
  constructor() {
    this.collectionsCount = new Map();
    this.activeRequests = new Map();
    this.backgroundConnection = null;
    this.connectionAttempts = 0;
    this.settings = {
      autoSave: false,
      showNotifications: true,
      maxRequests: 50,
      theme: 'default',
    };
    this.autoSaveEnabled = false;
  }

  /**
   * Restore collections count from loaded requests
   */
  restoreCollectionsCounts() {
    this.collectionsCount.clear();

    this.activeRequests.forEach(request => {
      if (request.queries) {
        request.queries.forEach(query => {
          const collection = this.extractCollectionFromQuery(query);
          if (collection) {
            const currentCount = this.collectionsCount.get(collection) || 0;
            this.collectionsCount.set(collection, currentCount + 1);
          }
        });
      }
    });

    this.updateCollectionsDisplay();
  }

  /**
   * Extract collection name from query
   */
  extractCollectionFromQuery(query) {
    if (query['Request details']?.collection) {
      return query['Request details'].collection;
    }

    // Try to extract from other query structures
    const queryStr = JSON.stringify(query);
    const collectionMatch = queryStr.match(/"collectionId":"([^"]+)"/);
    return collectionMatch ? collectionMatch[1] : null;
  }

  /**
   * Add a collection to the state and update the UI
   */
  addCollection(collection) {
    const currentCount = this.collectionsCount.get(collection) || 0;
    this.collectionsCount.set(collection, currentCount + 1);
    this.updateCollectionsDisplay();
  }

  // In state-manager.js
  addRequest(request) {
    // PERFORMANCE FIX: Limit number of requests stored
    const MAX_REQUESTS = this.settings?.maxRequests || 50;

    // Remove oldest requests if we exceed the limit
    if (this.activeRequests.size >= MAX_REQUESTS) {
      const oldestKey = this.activeRequests.keys().next().value;
      this.activeRequests.delete(oldestKey);

      // Also remove from DOM
      const oldestElement = document.querySelector(
        `[data-request-id="${oldestKey}"]`
      );
      if (oldestElement) oldestElement.remove();
    }

    this.activeRequests.set(request.requestId, request);
  }

  // In state-manager.js
  initVirtualList() {
    const container = DOM.requestsContainer;
    let visibleItems = [];
    const allItems = Array.from(this.activeRequests.values());

    const updateVisibleItems = () => {
      const scrollTop = container.scrollTop;
      const clientHeight = container.clientHeight;

      // Calculate visible range (with buffer)
      const startIndex = Math.max(0, Math.floor(scrollTop / 100) - 5);
      const endIndex = Math.min(
        allItems.length,
        Math.ceil((scrollTop + clientHeight) / 100) + 5
      );

      // Remove items that are no longer visible
      visibleItems = visibleItems.filter(item => {
        const index = allItems.indexOf(item);
        if (index < startIndex || index >= endIndex) {
          const el = container.querySelector(
            `[data-request-id="${item.requestId}"]`
          );
          if (el) el.remove();
          return false;
        }
        return true;
      });

      // Add newly visible items
      for (let i = startIndex; i < endIndex; i++) {
        if (i >= allItems.length) break;
        const item = allItems[i];
        if (!visibleItems.includes(item)) {
          visibleItems.push(item);
          this.renderRequestItem(item);
        }
      }

      // Update container height to accommodate all items
      container.style.height = `${allItems.length * 100}px`;
    };

    // Listen for scroll events
    container.addEventListener('scroll', updateVisibleItems);

    // Initial update
    updateVisibleItems();
  }

  /**
   * Render a request item using the RequestProcessor
   */
  renderRequestItem(request) {
    if (this.requestProcessor) {
      this.requestProcessor.createRequestContainer(request);
    }
  }

  /**
   * Clear all state and UI
   */
  async clearState() {
    this.collectionsCount.clear();
    this.activeRequests.clear();
    DOM.requestsContainer.innerHTML = '';
    this.updateCollectionsDisplay();
  }

  /**
   * Update the collections display in the UI
   */
  updateCollectionsDisplay() {
    DOM.collectionsCount.textContent = this.collectionsCount.size;
    DOM.collectionsContainer.innerHTML = '';

    if (this.collectionsCount.size === 0) {
      this.displayEmptyCollections();
      return;
    }

    this.displayCollections();
  }

  /**
   * Display empty state for collections
   */
  displayEmptyCollections() {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'collections-empty';
    emptyMessage.textContent = 'No collections captured yet';
    DOM.collectionsContainer.appendChild(emptyMessage);
  }

  /**
   * Display collections in the UI
   */
  displayCollections() {
    const sortedCollections = Array.from(this.collectionsCount.entries()).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );

    sortedCollections.forEach(([collection, count]) => {
      const tag = document.createElement('div');
      tag.className = 'collection-tag';
      tag.textContent = `${collection} (${count})`;
      DOM.collectionsContainer.appendChild(tag);
    });
  }

  extractTimingInfo(requestEl) {
    const timingDiv = requestEl.querySelector('.request-timing');
    if (!timingDiv) return {};

    const timingInfo = {};
    const timingLabels = timingDiv.querySelectorAll('.timing-label');

    timingLabels.forEach(label => {
      const value = label.nextElementSibling;
      if (!value) return;

      const labelText = label.textContent.toLowerCase().replace(':', '');
      switch (labelText) {
        case 'started':
          timingInfo.startTime = value.textContent;
          break;
        case 'duration':
          timingInfo.duration = value.textContent;
          break;
        case 'status':
          timingInfo.status = parseInt(value.textContent);
          break;
        case 'queries':
          timingInfo.queryCount = parseInt(value.textContent);
          break;
      }
    });

    return timingInfo;
  }

  prepareExportData() {
    const requestElements = document.querySelectorAll('.request-container');
    const exportData = [];

    requestElements.forEach(requestEl => {
      const requestId = requestEl.getAttribute('data-request-id');
      const request = this.activeRequests.get(requestId);
      if (!request) return;

      const timingInfo = this.extractTimingInfo(requestEl);
      exportData.push(this.createExportObject(request, timingInfo));
    });

    return {
      exportedAt: new Date().toISOString(),
      totalRequests: exportData.length,
      collections: Array.from(this.collectionsCount.entries()).map(
        ([name, count]) => ({ name, count })
      ),
      requests: exportData,
    };
  }

  createExportObject(request, timingInfo) {
    return {
      requestId: request.requestId,
      url: request.url,
      method: request.method,
      timestamp: request.timeStamp,
      timing: {
        startTime: new Date(request.timeStamp).toISOString(),
        duration: timingInfo.duration || 'pending',
        status: timingInfo.status || 'pending',
        queryCount: timingInfo.queryCount || 0,
      },
      queries: request.queries,
    };
  }

  downloadExportFile(exportContent) {
    const dataStr = JSON.stringify(exportContent, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);

    const downloadEl = document.createElement('a');
    downloadEl.href = url;
    downloadEl.download = `firescope-export-${new Date().toISOString()}.json`;

    document.body.appendChild(downloadEl);
    downloadEl.click();
    downloadEl.remove();
    window.URL.revokeObjectURL(url);
  }

  exportData(state) {
    try {
      const exportData = this.prepareExportData(state);
      if (!exportData || exportData.totalRequests === 0) {
        return false; // No data to export
      }
      this.downloadExportFile(exportData);
      return true; // Success
    } catch (error) {
      throw new Error(`Export failed: ${error.message}`);
    }
  }
}
