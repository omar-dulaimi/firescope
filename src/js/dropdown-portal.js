/**
 * Dropdown Portal
 * Renders dropdown menus outside clipping containers using document.body portal
 */

export class DropdownPortal {
  constructor() {
    this.activeDropdown = null;
    this.activeTrigger = null;
    this.portalContainer = null;
    this.isToggling = false;
    this.boundCloseOnEscape = this.closeOnEscape.bind(this);
    this.boundCloseOnOutsideClick = this.closeOnOutsideClick.bind(this);

    this.createPortalContainer();
  }

  /**
   * Create portal container in document.body
   */
  createPortalContainer() {
    this.portalContainer = document.createElement('div');
    this.portalContainer.id = 'firescope-dropdown-portal';
    this.portalContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 10000;
    `;
    document.body.appendChild(this.portalContainer);
  }

  /**
   * Open dropdown menu
   * @param {HTMLElement} trigger - Button that triggered the dropdown
   * @param {Array} menuItems - Array of {text, value, onClick} objects
   * @param {Object} options - Additional options
   */
  openDropdown(trigger, menuItems, options = {}) {
    // Prevent rapid toggling
    if (this.isToggling) return;
    this.isToggling = true;
    setTimeout(() => {
      this.isToggling = false;
    }, 100);

    // If clicking the same trigger that's already open, close it instead
    if (this.activeDropdown && this.activeTrigger === trigger) {
      this.closeDropdown();
      return;
    }

    this.closeDropdown(); // Close any existing dropdown

    const dropdown = this.createDropdownElement(menuItems, options);
    this.positionDropdown(dropdown, trigger, options);

    this.portalContainer.appendChild(dropdown);
    this.activeDropdown = dropdown;
    this.activeTrigger = trigger;

    // Enable event listeners
    document.addEventListener('keydown', this.boundCloseOnEscape);
    document.addEventListener('click', this.boundCloseOnOutsideClick);

    // Focus management
    this.setupFocusTrap(dropdown);

    // Animate in
    requestAnimationFrame(() => {
      dropdown.style.opacity = '1';
      dropdown.style.transform = 'translateY(0) scale(1)';
    });
  }

  /**
   * Close active dropdown
   */
  closeDropdown() {
    if (this.activeDropdown) {
      // Animate out
      this.activeDropdown.style.opacity = '0';
      this.activeDropdown.style.transform = 'translateY(-8px) scale(0.95)';

      setTimeout(() => {
        if (this.activeDropdown && this.activeDropdown.parentNode) {
          this.activeDropdown.parentNode.removeChild(this.activeDropdown);
        }
        this.activeDropdown = null;
        this.activeTrigger = null;
      }, 150);

      // Remove event listeners
      document.removeEventListener('keydown', this.boundCloseOnEscape);
      document.removeEventListener('click', this.boundCloseOnOutsideClick);
    }
  }

  /**
   * Create dropdown element
   */
  createDropdownElement(menuItems, _options) {
    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown-portal-menu';
    dropdown.setAttribute('role', 'menu');
    dropdown.setAttribute('tabindex', '-1');

    dropdown.style.cssText = `
      position: fixed;
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 8px;
      min-width: 180px;
      box-shadow: var(--shadow-lg);
      backdrop-filter: blur(8px);
      pointer-events: auto;
      opacity: 0;
      transform: translateY(-8px) scale(0.95);
      transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 10001;
    `;

    const list = document.createElement('ul');
    list.style.cssText = `
      list-style: none;
      margin: 0;
      padding: 0;
    `;

    menuItems.forEach((item, _index) => {
      const listItem = document.createElement('li');
      listItem.setAttribute('role', 'menuitem');
      listItem.setAttribute('tabindex', '0');
      // Build row with optional icon + label
      const row = document.createElement('div');
      row.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 8px;
      `;
      if (item.icon) {
        const iconWrap = document.createElement('span');
        iconWrap.style.cssText =
          'display:inline-flex;width:20px;height:20px;color:inherit;';
        iconWrap.innerHTML = item.icon;
        row.appendChild(iconWrap);
      }
      const label = document.createElement('span');
      label.textContent = item.text;
      row.appendChild(label);
      listItem.appendChild(row);
      listItem.dataset.value = item.value;

      const isSelected = item.isSelected || false;
      listItem.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        border-radius: 8px;
        font-size: 14px;
        transition: var(--transition);
        color: var(--text);
        ${isSelected ? 'background: var(--accent); color: white; font-weight: 600;' : ''}
      `;

      // Hover and focus styles
      const addHoverStyle = () => {
        if (!isSelected) {
          listItem.style.background = 'var(--surface)';
        }
      };
      const removeHoverStyle = () => {
        if (!isSelected) {
          listItem.style.background = 'transparent';
        }
      };

      listItem.addEventListener('mouseenter', addHoverStyle);
      listItem.addEventListener('mouseleave', removeHoverStyle);
      listItem.addEventListener('focus', addHoverStyle);
      listItem.addEventListener('blur', removeHoverStyle);

      // Click handler
      listItem.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        if (item.onClick) {
          item.onClick(item.value);
        }
        this.closeDropdown();
      });

      // Keyboard handler
      listItem.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          listItem.click();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.focusNextItem(listItem);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.focusPreviousItem(listItem);
        }
      });

      list.appendChild(listItem);
    });

    dropdown.appendChild(list);
    return dropdown;
  }

  /**
   * Position dropdown relative to trigger
   */
  positionDropdown(dropdown, trigger, _options) {
    const triggerRect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Default positioning
    let top = triggerRect.bottom + 4;
    let left = triggerRect.right;

    // Adjust horizontal position if dropdown would overflow viewport
    setTimeout(() => {
      const dropdownRect = dropdown.getBoundingClientRect();

      // Adjust horizontal position
      if (left + dropdownRect.width > viewportWidth) {
        left = triggerRect.left - dropdownRect.width + triggerRect.width;
      }
      if (left < 8) {
        left = 8;
      }

      // Adjust vertical position if dropdown would overflow bottom
      if (top + dropdownRect.height > viewportHeight) {
        top = triggerRect.top - dropdownRect.height - 4;
      }
      if (top < 8) {
        top = 8;
      }

      dropdown.style.left = left + 'px';
      dropdown.style.top = top + 'px';
    }, 0);

    // Initial positioning
    dropdown.style.left = left + 'px';
    dropdown.style.top = top + 'px';
  }

  /**
   * Setup focus trap for accessibility
   */
  setupFocusTrap(dropdown) {
    const focusableElements = dropdown.querySelectorAll('[role="menuitem"]');
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }
  }

  /**
   * Focus next menu item
   */
  focusNextItem(currentItem) {
    const items = Array.from(
      this.activeDropdown.querySelectorAll('[role="menuitem"]')
    );
    const currentIndex = items.indexOf(currentItem);
    const nextIndex = (currentIndex + 1) % items.length;
    items[nextIndex].focus();
  }

  /**
   * Focus previous menu item
   */
  focusPreviousItem(currentItem) {
    const items = Array.from(
      this.activeDropdown.querySelectorAll('[role="menuitem"]')
    );
    const currentIndex = items.indexOf(currentItem);
    const prevIndex = (currentIndex - 1 + items.length) % items.length;
    items[prevIndex].focus();
  }

  /**
   * Close on Escape key
   */
  closeOnEscape(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeDropdown();
    }
  }

  /**
   * Close on outside click
   */
  closeOnOutsideClick(event) {
    if (
      this.activeDropdown &&
      !this.activeDropdown.contains(event.target) &&
      !this.activeTrigger?.contains(event.target)
    ) {
      this.closeDropdown();
    }
  }

  /**
   * Cleanup portal container
   */
  destroy() {
    this.closeDropdown();
    if (this.portalContainer && this.portalContainer.parentNode) {
      this.portalContainer.parentNode.removeChild(this.portalContainer);
    }
  }
}
