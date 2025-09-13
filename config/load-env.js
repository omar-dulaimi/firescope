#!/usr/bin/env node

/**
 * Environment loader for FireScope
 * Loads environment variables from .env file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load environment variables from .env file
 */
export function loadEnv() {
  const envPath = path.join(__dirname, '../.env');

  try {
    // Check if .env file exists
    if (!fs.existsSync(envPath)) {
      console.warn('⚠️  .env file not found. Using default values.');
      console.log(
        '💡 Copy .env.example to .env and configure your Firebase settings'
      );
      return;
    }

    // Read .env file
    const envContent = fs.readFileSync(envPath, 'utf8');

    // Parse environment variables
    const envVars = envContent
      .split('\n')
      .filter(line => line.trim() && !line.startsWith('#'))
      .map(line => line.split('=').map(part => part.trim()))
      .filter(([key]) => key);

    // Set environment variables
    envVars.forEach(([key, value]) => {
      if (key && value) {
        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '');
        process.env[key] = cleanValue;
      }
    });

    console.log('✅ Environment variables loaded from .env file');
  } catch (error) {
    console.error('❌ Failed to load environment variables:', error.message);
    throw error;
  }
}
