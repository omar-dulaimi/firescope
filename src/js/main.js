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
import { ConnectionManager } from './connection-manager.js';
import { NotificationManager } from './notification-manager.js';
import { RequestProcessor } from './request-processor.js';
import { SearchManager } from './search-manager.js';
import { SettingsManager } from './settings-manager.js';
import { StateManager } from './state-manager.js';
import { UIManager } from './ui-manager.js';

/**
 * Initialize the application
 */
function initializeApp() {
  const notificationManager = new NotificationManager();
  const state = new StateManager();
  const uiManager = new UIManager(state); // Create UIManager instance
  state.uiManager = uiManager; // Attach UIManager to state
  state.notificationManager = notificationManager; // Attach NotificationManager to state

  // Initialize notification manager with current setting
  notificationManager.enabled = state.settings.showNotifications;

  const searchManager = new SearchManager(state);
  state.searchManager = searchManager; // Attach SearchManager to state

  const settingsManager = new SettingsManager(state);
  state.settingsManager = settingsManager; // Attach SettingsManager to state

  const requestProcessor = new RequestProcessor(state);
  state.requestProcessor = requestProcessor; // Attach RequestProcessor to state
  const connectionManager = new ConnectionManager(state, requestProcessor);

  // Initial connection setup
  connectionManager.setupConnection();

  // Set up periodic connection check
  setInterval(() => {
    if (
      !state.backgroundConnection &&
      state.connectionAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS
    ) {
      connectionManager.setupConnection();
    }
  }, CONFIG.HEARTBEAT_INTERVAL);

  return state;
}

// Start the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const state = initializeApp();

  // Add event listener for the Clear button
  DOM.clearButton.addEventListener('click', async () => {
    try {
      await state.clearState();
      state.notificationManager.success('All requests cleared');
    } catch (_error) {
      state.notificationManager.error('Failed to clear requests');
    }
  });

  DOM.exportAllButton.addEventListener('click', () => {
    try {
      const result = state.exportData();
      if (result) {
        state.notificationManager.success('Data exported successfully');
      } else {
        state.notificationManager.warning('No data to export');
      }
    } catch (_error) {
      state.notificationManager.error('Failed to export data');
    }
  });

  // Add event listener for collections toggle
  DOM.collectionsToggle.addEventListener('click', () => {
    DOM.collectionsPopover.classList.toggle('visible');
    const chevron = DOM.collectionsToggle.querySelector('.chevron-icon');
    chevron.classList.toggle('open');
  });

  // Close popover when clicking outside
  document.addEventListener('click', event => {
    if (
      !DOM.collectionsToggle.contains(event.target) &&
      !DOM.collectionsPopover.contains(event.target)
    ) {
      DOM.collectionsPopover.classList.remove('visible');
      const chevron = DOM.collectionsToggle.querySelector('.chevron-icon');
      chevron.classList.remove('open');
    }
  });
});
