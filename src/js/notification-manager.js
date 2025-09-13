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
 * Manages user notifications and feedback
 */
export class NotificationManager {
  constructor() {
    this.container = document.getElementById('notifications');
    this.notifications = new Map();
    this.enabled = true; // Default to enabled
  }

  /**
   * Show a notification
   */
  show(message, type = 'info', duration = 5000) {
    // Don't show notifications if disabled
    if (!this.enabled) {
      return null;
    }

    const id = Date.now().toString();
    const notification = this.createNotification(id, message, type);

    this.container.appendChild(notification);
    this.notifications.set(id, notification);

    // Trigger animation
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        this.remove(id);
      }, duration);
    }

    return id;
  }

  /**
   * Create notification element
   */
  createNotification(id, message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.setAttribute('data-id', id);

    // Click to dismiss
    notification.addEventListener('click', () => {
      this.remove(id);
    });

    return notification;
  }

  /**
   * Remove a notification
   */
  remove(id) {
    const notification = this.notifications.get(id);
    if (!notification) return;

    notification.classList.remove('show');

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
      this.notifications.delete(id);
    }, 300);
  }

  /**
   * Clear all notifications
   */
  clear() {
    this.notifications.forEach((notification, id) => {
      this.remove(id);
    });
  }

  /**
   * Show success message
   */
  success(message, duration = 3000) {
    return this.show(message, 'success', duration);
  }

  /**
   * Show error message
   */
  error(message, duration = 7000) {
    return this.show(message, 'error', duration);
  }

  /**
   * Show warning message
   */
  warning(message, duration = 5000) {
    return this.show(message, 'warning', duration);
  }

  /**
   * Show info message
   */
  info(message, duration = 4000) {
    return this.show(message, 'info', duration);
  }
}
