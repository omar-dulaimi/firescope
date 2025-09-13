#!/usr/bin/env node

/**
 * Automated versioning script for FireScope Chrome Extension
 * Keeps package.json and manifest.json versions in sync
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON = path.join(__dirname, 'package.json');
const MANIFEST_JSON = path.join(__dirname, 'manifest.json');

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];
const customVersion = args[1];

/**
 * Read and parse JSON file
 */
function readJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Error reading ${filePath}:`, error.message);
    process.exit(1);
  }
}

/**
 * Write JSON file with proper formatting
 */
function writeJson(filePath, data) {
  try {
    const content = JSON.stringify(data, null, 2) + '\n';
    fs.writeFileSync(filePath, content, 'utf8');
  } catch (error) {
    console.error(`❌ Error writing ${filePath}:`, error.message);
    process.exit(1);
  }
}

/**
 * Parse semver version
 */
function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid version format: ${version}`);
  }
  return {
    major: parseInt(match[1]),
    minor: parseInt(match[2]),
    patch: parseInt(match[3]),
  };
}

/**
 * Format version object back to string
 */
function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/**
 * Increment version based on type
 */
function incrementVersion(currentVersion, type) {
  const version = parseVersion(currentVersion);

  switch (type) {
    case 'major':
      version.major++;
      version.minor = 0;
      version.patch = 0;
      break;
    case 'minor':
      version.minor++;
      version.patch = 0;
      break;
    case 'patch':
      version.patch++;
      break;
    default:
      throw new Error(
        `Invalid version type: ${type}. Use: major, minor, patch`
      );
  }

  return formatVersion(version);
}

/**
 * Update version in both files
 */
function updateVersion(newVersion) {
  console.log(`🔄 Updating version to ${newVersion}...`);

  // Read both files
  const packageJson = readJson(PACKAGE_JSON);
  const manifestJson = readJson(MANIFEST_JSON);

  // Store old version
  const oldVersion = packageJson.version;

  // Update versions
  packageJson.version = newVersion;
  manifestJson.version = newVersion;

  // Write back to files
  writeJson(PACKAGE_JSON, packageJson);
  writeJson(MANIFEST_JSON, manifestJson);

  console.log(`✅ Version updated: ${oldVersion} → ${newVersion}`);
  console.log(`📄 Updated: package.json`);
  console.log(`📄 Updated: manifest.json`);

  return { oldVersion, newVersion };
}

/**
 * Show current version
 */
function showVersion() {
  const packageJson = readJson(PACKAGE_JSON);
  const manifestJson = readJson(MANIFEST_JSON);

  console.log(`📦 package.json: ${packageJson.version}`);
  console.log(`🔧 manifest.json: ${manifestJson.version}`);

  if (packageJson.version !== manifestJson.version) {
    console.log(`⚠️  Warning: Versions are out of sync!`);
    return false;
  } else {
    console.log(`✅ Versions are in sync`);
    return true;
  }
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
🏷️  FireScope Version Manager

Usage:
  node version.js <command> [options]

Commands:
  show                     Show current versions
  patch                    Increment patch version (1.0.0 → 1.0.1)
  minor                    Increment minor version (1.0.0 → 1.1.0)  
  major                    Increment major version (1.0.0 → 2.0.0)
  set <version>            Set specific version (e.g., 1.2.3)
  sync                     Sync manifest.json to package.json version
  help                     Show this help

Examples:
  node version.js show
  node version.js patch
  node version.js minor
  node version.js set 1.2.0
  node version.js sync
`);
}

/**
 * Sync manifest.json to package.json version
 */
function syncVersions() {
  const packageJson = readJson(PACKAGE_JSON);
  const manifestJson = readJson(MANIFEST_JSON);

  if (packageJson.version === manifestJson.version) {
    console.log(`✅ Versions already in sync: ${packageJson.version}`);
    return;
  }

  console.log(`🔄 Syncing manifest.json to package.json version...`);
  manifestJson.version = packageJson.version;
  writeJson(MANIFEST_JSON, manifestJson);

  console.log(`✅ Synced: ${manifestJson.version} → ${packageJson.version}`);
}

// Main execution
try {
  console.log('🏷️  FireScope Version Manager');
  console.log('============================\n');

  switch (command) {
    case 'show':
    case undefined:
      showVersion();
      break;

    case 'patch':
    case 'minor':
    case 'major': {
      const packageJson = readJson(PACKAGE_JSON);
      const newVersion = incrementVersion(packageJson.version, command);
      updateVersion(newVersion);
      break;
    }

    case 'set':
      if (!customVersion) {
        console.error('❌ Error: Please specify a version number');
        console.log('Example: node version.js set 1.2.0');
        process.exit(1);
      }

      // Validate version format
      try {
        parseVersion(customVersion);
        updateVersion(customVersion);
      } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
      }
      break;

    case 'sync':
      syncVersions();
      break;

    case 'help':
      showHelp();
      break;

    default:
      console.error(`❌ Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
