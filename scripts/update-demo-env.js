#!/usr/bin/env node

/**
 * Update demo website firebase-env.js from .env file
 * This script synchronizes the .env file with the browser-compatible config
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from '../config/load-env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
loadEnv();

// Read current .env values
const firebaseConfig = {
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || '',
  FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN || '',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
  FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || '',
  FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  FIREBASE_APP_ID: process.env.FIREBASE_APP_ID || '',
};

// Generate the firebase-env.js content
const envFileContent = `/**
 * Browser-compatible Firebase environment loader
 * This file is auto-generated from .env - do not edit manually
 * Run 'pnpm run sync:demo-env' to update this file
 */

// Firebase Configuration for Demo Website
export const firebaseEnv = {
  FIREBASE_API_KEY: "${firebaseConfig.FIREBASE_API_KEY}",
  FIREBASE_AUTH_DOMAIN: "${firebaseConfig.FIREBASE_AUTH_DOMAIN}",
  FIREBASE_PROJECT_ID: "${firebaseConfig.FIREBASE_PROJECT_ID}",
  FIREBASE_STORAGE_BUCKET: "${firebaseConfig.FIREBASE_STORAGE_BUCKET}",
  FIREBASE_MESSAGING_SENDER_ID: "${firebaseConfig.FIREBASE_MESSAGING_SENDER_ID}",
  FIREBASE_APP_ID: "${firebaseConfig.FIREBASE_APP_ID}"
};

// Firebase SDK compatible format
export const firebaseConfig = {
  apiKey: firebaseEnv.FIREBASE_API_KEY,
  authDomain: firebaseEnv.FIREBASE_AUTH_DOMAIN,
  projectId: firebaseEnv.FIREBASE_PROJECT_ID,
  storageBucket: firebaseEnv.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: firebaseEnv.FIREBASE_MESSAGING_SENDER_ID,
  appId: firebaseEnv.FIREBASE_APP_ID
};

// Demo configuration moved to demo-config.js (version controlled)

// Set environment variables for browser compatibility
if (typeof window !== 'undefined') {
  window.firebaseEnv = firebaseEnv;
}`;

// Write the file
const outputPath = path.join(__dirname, '../demo/firebase-env.js');
try {
  fs.writeFileSync(outputPath, envFileContent, 'utf8');
  console.log('✅ Successfully updated demo/firebase-env.js from .env file');

  // Show the config that was written (without sensitive API keys)
  const safeConfig = { ...firebaseConfig };
  if (safeConfig.FIREBASE_API_KEY) {
    safeConfig.FIREBASE_API_KEY =
      safeConfig.FIREBASE_API_KEY.slice(0, 10) + '...';
  }
  console.log('📄 Configuration:', safeConfig);
} catch (error) {
  console.error('❌ Failed to update firebase-env.js:', error.message);
  process.exit(1);
}
