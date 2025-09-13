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

/**
 * Manages settings panel and preferences
 */
export class SettingsManager {
  constructor(stateManager) {
    this.state = stateManager;
    this.modal = document.getElementById('settingsModal');
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Settings button
    const settingsButton = document.getElementById('settingsButton');
    settingsButton.addEventListener('click', () => this.openSettings());

    // Close button
    const closeButton = document.getElementById('closeSettingsButton');
    closeButton.addEventListener('click', () => this.closeSettings());

    // Save button
    const saveButton = document.getElementById('saveSettingsButton');
    saveButton.addEventListener('click', () => this.saveSettings());

    // Reset button
    const resetButton = document.getElementById('resetSettingsButton');
    resetButton.addEventListener('click', () => this.resetSettings());

    // Close modal when clicking outside
    this.modal.addEventListener('click', e => {
      if (e.target === this.modal) {
        this.closeSettings();
      }
    });

    // ESC key to close
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.modal.classList.contains('visible')) {
        this.closeSettings();
      }
    });
  }

  async openSettings() {
    await this.loadCurrentSettings();
    this.modal.classList.add('visible');
  }

  closeSettings() {
    this.modal.classList.remove('visible');
  }

  async loadCurrentSettings() {
    const settings = this.state.settings;

    // Load checkbox values
    document.getElementById('notificationsCheckbox').checked =
      settings.showNotifications;
    document.getElementById('maxRequestsInput').value = settings.maxRequests;
  }

  async saveSettings() {
    try {
      const settings = {
        autoSave: false,
        showNotifications: document.getElementById('notificationsCheckbox')
          .checked,
        maxRequests: parseInt(
          document.getElementById('maxRequestsInput').value
        ),
        theme: 'default',
      };

      // Validate settings
      if (settings.maxRequests < 10 || settings.maxRequests > 100) {
        this.state.notificationManager?.error(
          'Max requests must be between 10 and 100'
        );
        return;
      }

      // Update state
      this.state.settings = settings;
      this.state.autoSaveEnabled = settings.autoSave;

      // Update notification manager
      if (this.state.notificationManager) {
        this.state.notificationManager.enabled = settings.showNotifications;
      }

      this.state.notificationManager?.success('Settings saved successfully');
      this.closeSettings();
    } catch (_error) {
      this.state.notificationManager?.error('Failed to save settings');
    }
  }

  async resetSettings() {
    try {
      const defaultSettings = {
        autoSave: false,
        showNotifications: true,
        maxRequests: 50,
        theme: 'default',
      };

      // Update UI
      document.getElementById('notificationsCheckbox').checked =
        defaultSettings.showNotifications;
      document.getElementById('maxRequestsInput').value =
        defaultSettings.maxRequests;

      this.state.notificationManager?.info('Settings reset to defaults');
    } catch (_error) {
      this.state.notificationManager?.error('Failed to reset settings');
    }
  }

  // Method to be called when notifications setting changes
  updateNotificationSetting(enabled) {
    if (this.state.notificationManager) {
      this.state.notificationManager.enabled = enabled;
    }
  }
}
