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
 * Manages search and filtering functionality
 */
export class SearchManager {
  constructor(stateManager) {
    this.state = stateManager;
    this.currentFilter = '';
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Search input event listener
    DOM.searchInput.addEventListener('input', e => {
      this.handleSearch(e.target.value);
    });

    // Clear search button
    DOM.clearSearchButton.addEventListener('click', () => {
      this.clearSearch();
    });

    // Show/hide clear button based on input
    DOM.searchInput.addEventListener('input', e => {
      this.toggleClearButton(e.target.value);
    });

    // Enter key to focus search
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        DOM.searchInput.focus();
      }

      if (e.key === 'Escape' && document.activeElement === DOM.searchInput) {
        this.clearSearch();
        DOM.searchInput.blur();
      }
    });
  }

  /**
   * Handle search input
   */
  handleSearch(query) {
    this.currentFilter = query.toLowerCase().trim();
    console.log('Search filter set to:', this.currentFilter);
    this.filterRequests();

    if (this.currentFilter) {
      this.state.notificationManager?.info(`Filtering by: "${query}"`, 2000);
    }
  }

  /**
   * Filter requests based on current query
   */
  filterRequests() {
    const requestElements =
      DOM.requestsContainer.querySelectorAll('.request-container');
    let visibleCount = 0;

    console.log(
      'Filtering requests. Total elements:',
      requestElements.length,
      'Filter:',
      this.currentFilter
    );

    requestElements.forEach(element => {
      const requestId = element.getAttribute('data-request-id');
      const request = this.state.activeRequests.get(requestId);

      if (!request) {
        console.log(
          'No request found for ID:',
          requestId,
          'removing orphaned element'
        );
        element.remove();
        return;
      }

      // Filter individual queries within this request
      const hasVisibleQueries = this.filterQueriesInRequest(element, request);

      if (hasVisibleQueries) {
        element.classList.remove('filtered-out');
        visibleCount++;
      } else {
        element.classList.add('filtered-out');
      }
    });

    console.log(
      'Filter complete. Visible:',
      visibleCount,
      'Total:',
      requestElements.length
    );
    this.updateFilterStatus(visibleCount, requestElements.length);
  }

  /**
   * Filter individual queries within a request
   */
  filterQueriesInRequest(requestElement, request) {
    const queriesContainer = requestElement.querySelector('.queries-container');
    if (!queriesContainer) return false;

    const queryContainers =
      queriesContainer.querySelectorAll('.query-container');
    let visibleQueryCount = 0;

    queryContainers.forEach((queryContainer, index) => {
      if (index >= request.queries.length) return;

      const query = request.queries[index];
      const collection = this.state.extractCollectionFromQuery(query);

      if (
        !this.currentFilter ||
        (collection && collection.toLowerCase().includes(this.currentFilter))
      ) {
        queryContainer.classList.remove('filtered-out');
        visibleQueryCount++;
      } else {
        queryContainer.classList.add('filtered-out');
      }
    });

    return visibleQueryCount > 0;
  }

  /**
   * Determine if a request should be shown based on current filter
   */
  shouldShowRequest(request) {
    if (!this.currentFilter) return true;

    // Check if any query in the request matches the filter
    if (request.queries) {
      return request.queries.some(query => {
        const collection = this.state.extractCollectionFromQuery(query);
        return (
          collection && collection.toLowerCase().includes(this.currentFilter)
        );
      });
    }

    return false;
  }

  /**
   * Extract searchable text from a request (collection names only)
   */
  extractSearchableText(request) {
    const collectionNames = [];

    // Extract collection names from queries
    if (request.queries) {
      request.queries.forEach(query => {
        const collection = this.state.extractCollectionFromQuery(query);
        if (collection) {
          collectionNames.push(collection);
        }
      });
    }

    return collectionNames.join(' ');
  }

  /**
   * Update filter status in UI
   */
  updateFilterStatus(visibleCount, totalCount) {
    if (this.currentFilter && visibleCount !== totalCount) {
      const _status = `Showing ${visibleCount} of ${totalCount} requests`;
      // You could add a status element to show this
    }
  }

  /**
   * Clear current search
   */
  clearSearch() {
    DOM.searchInput.value = '';
    this.currentFilter = '';
    this.filterRequests();
    this.toggleClearButton('');
  }

  /**
   * Toggle visibility of clear search button
   */
  toggleClearButton(value) {
    if (value.trim()) {
      DOM.clearSearchButton.classList.add('visible');
    } else {
      DOM.clearSearchButton.classList.remove('visible');
    }
  }

  /**
   * Apply filter to newly added requests
   */
  filterNewRequest(requestElement) {
    const requestId = requestElement.getAttribute('data-request-id');
    const request = this.state.activeRequests.get(requestId);

    if (!request) return;

    // Filter individual queries within this request
    const hasVisibleQueries = this.filterQueriesInRequest(
      requestElement,
      request
    );

    if (hasVisibleQueries) {
      requestElement.classList.remove('filtered-out');
    } else {
      requestElement.classList.add('filtered-out');
    }
  }

  /**
   * Get current filter query
   */
  getCurrentFilter() {
    return this.currentFilter;
  }

  /**
   * Set filter programmatically
   */
  setFilter(query) {
    DOM.searchInput.value = query;
    this.handleSearch(query);
    this.toggleClearButton(query);
  }
}
