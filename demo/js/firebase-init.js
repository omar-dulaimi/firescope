import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getFirestore,
  collection,
  query,
  limit,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from '../firebase-env.js';
import { demoConfig } from '../demo-config.js';
import { showStatus } from './ui-utils.js';

// Global variables
let app, db;

// Initialize Firebase
function initializeFirebase() {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    showStatus('🔥 Firebase initialized successfully!', 'success');
    console.log('Firebase initialized with project:', firebaseConfig.projectId);
  } catch (error) {
    showStatus(`Failed to initialize Firebase: ${error.message}`, 'error');
    console.error('Firebase initialization error:', error);
  }
}

// Test connection
async function checkConnection() {
  if (!db) {
    showStatus('Please initialize Firebase first', 'error');
    return;
  }

  try {
    // Try a simple query to test connection
    const testQuery = query(
      collection(db, demoConfig.collections.Users),
      limit(1)
    );
    await getDocs(testQuery);
    showStatus('✅ Firestore connection successful!', 'success');
  } catch (error) {
    showStatus(`Connection failed: ${error.message}`, 'error');
    console.error('Connection test failed:', error);
  }
}

function clearResults() {
  showStatus('Results cleared', 'info');
  console.clear();
}

// Export functions and variables
export { app, db, initializeFirebase, checkConnection, clearResults };
