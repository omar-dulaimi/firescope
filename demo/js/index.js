// Main demo application entry point
// This file imports all modules and sets up global window functions for compatibility

import {
  initializeFirebase,
  checkConnection,
  clearResults,
} from './firebase-init.js';

import {
  demoUserQueries,
  demoContentQueries,
  demoEcommerceQueries,
  demoAnalyticsQueries,
  demoAdvancedQueries,
  demoDocumentOperations,
  demoCollectionGroupQueries,
  demoAggregations,
  startAutoDemo,
  stopAutoDemo,
} from './query-generators.js';

// Make functions available globally on window object for HTML compatibility
window.checkConnection = checkConnection;
window.clearResults = clearResults;
window.demoUserQueries = demoUserQueries;
window.demoContentQueries = demoContentQueries;
window.demoEcommerceQueries = demoEcommerceQueries;
window.demoAnalyticsQueries = demoAnalyticsQueries;
window.demoAdvancedQueries = demoAdvancedQueries;
window.demoDocumentOperations = demoDocumentOperations;
window.demoCollectionGroupQueries = demoCollectionGroupQueries;
window.demoAggregations = demoAggregations;
window.startAutoDemo = startAutoDemo;
window.stopAutoDemo = stopAutoDemo;
// Attach Aggregations button without relying on inline onclick
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('runAggregationsBtn');
  if (btn) {
    btn.addEventListener('click', function () {
      try {
        demoAggregations(this);
      } catch (e) {
        console.error('Failed to run aggregation demos:', e);
      }
    });
  }
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function () {
      try {
        fn(this);
      } catch (e) {
        console.error(`Failed: ${id}`, e);
      }
    });
  };
  bind('runUserDemosBtn', demoUserQueries);
  bind('runContentDemosBtn', demoContentQueries);
  bind('runEcommerceDemosBtn', demoEcommerceQueries);
  bind('runAnalyticsDemosBtn', demoAnalyticsQueries);
  bind('runAdvancedDemosBtn', demoAdvancedQueries);
  bind('runDocumentDemosBtn', demoDocumentOperations);
  bind('runCollectionGroupDemosBtn', demoCollectionGroupQueries);
  const startBtn = document.getElementById('startAutoDemoBtn');
  if (startBtn) startBtn.addEventListener('click', () => startAutoDemo());
  const stopBtn = document.getElementById('stopAutoDemoBtn');
  if (stopBtn) stopBtn.addEventListener('click', () => stopAutoDemo());
  const testBtn = document.getElementById('testConnectionBtn');
  if (testBtn) testBtn.addEventListener('click', () => checkConnection());
  const clearBtn = document.getElementById('clearResultsBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => clearResults());
});

// Initialize Firebase on page load
window.addEventListener('load', () => {
  setTimeout(() => {
    initializeFirebase();
  }, 1000);
});

// Export everything for potential ES module usage
export {
  checkConnection,
  clearResults,
  demoUserQueries,
  demoContentQueries,
  demoEcommerceQueries,
  demoAnalyticsQueries,
  demoAdvancedQueries,
  demoDocumentOperations,
  demoAggregations,
  startAutoDemo,
  stopAutoDemo,
};
