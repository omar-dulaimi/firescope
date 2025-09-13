#!/usr/bin/env node

/**
 * Firebase Configuration Loader
 * Loads Firebase configuration from environment variables
 */

import { loadEnv } from './load-env.js';

/**
 * Get Firebase configuration object from environment variables
 * @returns {Object} Firebase configuration object
 */
export function getFirebaseConfig() {
  // Load environment variables
  loadEnv();

  // Build Firebase configuration from environment variables
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  };

  // Validate required configuration
  const requiredFields = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
  ];

  const missingFields = requiredFields.filter(field => !firebaseConfig[field]);

  if (missingFields.length > 0) {
    console.error('❌ Missing required Firebase configuration fields:');
    missingFields.forEach(field => {
      console.error(`   - ${field}`);
    });
    console.log(
      '\n💡 Please update your .env file with the missing Firebase configuration values.'
    );
    console.log(
      '   You can find these values in your Firebase Console → Project Settings → General → Your apps'
    );
    process.exit(1);
  }

  console.log('✅ Firebase configuration loaded successfully');
  return firebaseConfig;
}

/**
 * Get Firebase configuration for browser environment
 * @returns {Object} Firebase configuration object for browser
 */
export function getBrowserFirebaseConfig() {
  const config = getFirebaseConfig();

  // Return a safe version for browser (without sensitive API keys in logs)
  return {
    ...config,
    apiKey: config.apiKey ? `${config.apiKey.slice(0, 10)}...` : undefined,
  };
}
