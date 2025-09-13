import { QueryExporter } from './query-exporter.js';

/**
 * Manages UI interactions and events
 */
export class UIManager {
  constructor(stateManager) {
    this.state = stateManager;
    this.setupEventListeners();
  }

  /**
   * Set up event listeners for UI elements
   */
  setupEventListeners() {
    this.queryExporter = new QueryExporter();
  }
}
