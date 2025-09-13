/**
 * Theme Manager
 * Handles light/dark theme switching with system preference detection
 */

export class ThemeManager {
  constructor() {
    this.currentTheme = this.detectInitialTheme();
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.themeToggle = null;

    this.init();
  }

  /**
   * Initialize theme manager
   */
  init() {
    // Apply initial theme
    this.applyTheme(this.currentTheme);

    // Listen for system theme changes
    this.mediaQuery.addEventListener('change', _e => {
      if (this.currentTheme === 'system') {
        this.applyTheme('system');
      }
    });

    // Find and setup theme toggle button
    this.setupThemeToggle();
  }

  /**
   * Detect initial theme from localStorage or system preference
   */
  detectInitialTheme() {
    const savedTheme = globalThis.localStorage?.getItem('firescope-theme');
    if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
      return savedTheme;
    }
    return 'system'; // Default to system preference
  }

  /**
   * Setup theme toggle button
   */
  setupThemeToggle() {
    this.themeToggle = document.getElementById('themeToggle');
    if (this.themeToggle) {
      this.updateToggleIcon();
      this.themeToggle.addEventListener('click', () => {
        this.cycleTheme();
      });
    }
  }

  /**
   * Cycle through themes: system → light → dark → system
   */
  cycleTheme() {
    const themeOrder = ['system', 'light', 'dark'];
    const currentIndex = themeOrder.indexOf(this.currentTheme);
    const nextIndex = (currentIndex + 1) % themeOrder.length;
    const nextTheme = themeOrder[nextIndex];

    this.setTheme(nextTheme);
  }

  /**
   * Set theme and persist to localStorage
   */
  setTheme(theme) {
    this.currentTheme = theme;
    globalThis.localStorage?.setItem('firescope-theme', theme);
    this.applyTheme(theme);
    this.updateToggleIcon();
  }

  /**
   * Apply theme to document
   */
  applyTheme(theme) {
    const root = document.documentElement;

    // Remove existing theme attributes
    root.removeAttribute('data-theme');

    if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    }
    // For 'system', we rely on CSS media queries
  }

  /**
   * Update toggle button icon and tooltip
   */
  updateToggleIcon() {
    if (!this.themeToggle) return;

    const icons = {
      system: '🌓',
      light: '☀️',
      dark: '🌙',
    };

    const tooltips = {
      system: 'Theme: System (click to switch to Light)',
      light: 'Theme: Light (click to switch to Dark)',
      dark: 'Theme: Dark (click to switch to System)',
    };

    this.themeToggle.textContent = icons[this.currentTheme];
    this.themeToggle.title = tooltips[this.currentTheme];
  }

  /**
   * Get current effective theme (resolves 'system' to actual theme)
   */
  getEffectiveTheme() {
    if (this.currentTheme === 'system') {
      return this.mediaQuery.matches ? 'dark' : 'light';
    }
    return this.currentTheme;
  }

  /**
   * Get current theme setting
   */
  getCurrentTheme() {
    return this.currentTheme;
  }
}
