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

import { CONFIG } from './config.js';

/**
 * Manages connection to the background page
 */
export class ConnectionManager {
  constructor(stateManager, requestProcessor) {
    this.state = stateManager;
    this.requestProcessor = requestProcessor;
  }

  /**
   * Set up connection to the background page
   */
  setupConnection() {
    try {
      this.disconnectExistingConnection();

      this.state.backgroundConnection = chrome.runtime.connect({
        name: 'firescope-panel',
      });
      this.state.backgroundConnection.postMessage({
        type: 'init',
        tabId: chrome.devtools.inspectedWindow.tabId,
      });

      this.setupConnectionListeners();
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Disconnect any existing connection
   */
  disconnectExistingConnection() {
    if (this.state.backgroundConnection) {
      try {
        this.state.backgroundConnection.disconnect();
      } catch (_e) {
        // Silent error handling for connection disconnect
      }
    }
  }

  /**
   * Set up connection event listeners
   */
  setupConnectionListeners() {
    this.state.backgroundConnection.onDisconnect.addListener(() => {
      this.handleDisconnect();
    });

    this.state.backgroundConnection.onMessage.addListener(request => {
      this.handleMessage(request);
    });
  }

  /**
   * Handle connection disconnection
   */
  handleDisconnect() {
    this.state.backgroundConnection = null;

    if (this.state.connectionAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
      this.state.connectionAttempts++;
      setTimeout(
        () => this.setupConnection(),
        CONFIG.RECONNECT_DELAY * this.state.connectionAttempts
      );
    } else {
      this.state.notificationManager?.error(
        'Failed to establish connection to background service'
      );
    }
  }

  /**
   * Handle incoming messages from the background page
   */
  handleMessage(message) {
    try {
      if (message.type === 'heartbeat') {
        this.state.connectionAttempts = 0;
        return;
      }

      if (message.type === 'connectionEstablished') {
        this.state.notificationManager?.success(
          'Connected to FireScope background service',
          2000
        );
        return;
      }

      if (message.type === 'request') {
        // Handle new background.js format: { type: 'request', payload: {...} }
        this.requestProcessor.handleNewFormatRequest(message.payload);
        return;
      }

      // Legacy format handling for backward compatibility
      if (message.type === 'requestComplete') {
        this.requestProcessor.updateRequestTiming(message);
        return;
      }

      if (message.url?.includes(CONFIG.TARGET_URL)) {
        this.requestProcessor.handleRequest(message);
      }
    } catch (_error) {
      // Silent error handling for request processing
    }
  }
}
