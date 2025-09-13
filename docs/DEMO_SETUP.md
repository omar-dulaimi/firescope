# FireScope Demo Setup Guide

This guide helps you set up realistic demo data and browser-based demonstrations for showcasing FireScope's capabilities.

## 🔥 Firebase Setup

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project: `firescope-demo`
3. Enable Firestore Database
4. Set up authentication (optional for demos)

### 2. Get Firebase Config

1. Go to Project Settings → General
2. Scroll down to "Your apps"
3. Click "Web app" icon to create/view web app
4. Copy the Firebase configuration object

### 3. Update Configuration

Copy `.env.example` to `.env` and update with your Firebase project settings:

```bash
cp .env.example .env
```

Then edit `.env` with your actual Firebase configuration:

```bash
FIREBASE_API_KEY=your-api-key-here
FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:your-app-id
```

**Note**: Firebase configuration is now centralized using environment variables. All demo scripts will automatically use the `.env` file.

## 🌱 Seeding Demo Data

### Quick Start

```bash
# Install dependencies
npm install

# Seed all demo data (recommended)
npm run demo:seed

# This creates:
# - 50 Users
# - 100 Posts
# - 200 Comments
# - 30 Products
# - 75 Orders
# - 30 days of Analytics
```

### Individual Collections

```bash
# Seed specific collections
npm run demo:seed-Users     # 50 Users
npm run demo:seed-Posts     # 100 Posts

# Custom counts
node demo-seed-data.js Users 25
node demo-seed-data.js Posts 50
node demo-seed-data.js Analytics 7  # 7 days
```

### Demo Operations Script

```bash
# Generate interactive demo script
npm run demo:operations

# This creates demo-operations.js with pre-built queries
```

## 🎬 Demo Website (Recommended for Recordings)

### 1. Setup Demo Website

```bash
# 1. Seed the database (creates realistic data)
npm run demo:seed

# 2. Update Firebase config in .env file
# Copy .env.example to .env and update with your project settings

# 3. Start demo website
npm run demo:website
# This opens http://localhost:3000 with the demo interface
```

### 2. Recording with Demo Website

1. **Load FireScope extension** in Chrome
2. **Open DevTools** (F12) → **FireScope tab**
3. **Navigate to demo website** (http://localhost:3000)
4. **Click demo buttons** or use **Auto Demo Mode**
5. **Watch FireScope capture** all queries in real-time

### 3. Demo Website Features

- **🔥 Initialize Firebase** - Connect to your Firestore
- **Individual demo categories** - Users, Content, E-commerce, Analytics
- **🎬 Auto Demo Mode** - Continuous query generation for recordings
- **Real-time status** - See query results and timing
- **Professional UI** - Great for video demonstrations

### 4. Alternative: Console Commands

If you prefer browser console commands:

```javascript
// Available after visiting demo website
demoUserQueries(); // User management queries
demoContentQueries(); // Blog/content queries
demoEcommerceQueries(); // Product/order queries
demoAnalyticsQueries(); // Metrics and reporting
demoAdvancedQueries(); // Complex multi-collection
demoDocumentOperations(); // Single document operations

// Auto demo sequence
startAutoDemo(); // Start continuous demo
stopAutoDemo(); // Stop auto demo
```

## 📊 Demo Data Structure

### Collections Created

- **Users** (50 docs) - User profiles with roles, companies, settings
- **Posts** (100 docs) - Blog Posts with categories, tags, status
- **Comments** (200 docs) - Comments linked to Posts and Users
- **Products** (30 docs) - E-commerce Products with pricing, inventory
- **Orders** (75 docs) - Customer Orders with items and shipping
- **Analytics** (30 docs) - Daily Analytics with metrics and traffic

### Query Types Demonstrated

- **Simple filters**: `where('active', '==', true)`
- **Complex queries**: Multiple where clauses + orderBy + limit
- **Document lookups**: Get single documents by ID
- **Multiple collections**: Parallel queries across collections
- **E-commerce patterns**: Price ranges, inventory checks
- **Time-series data**: Date range queries for Analytics

## 🎯 Recording Scenarios

### Scenario 1: Real-time Monitoring (30 sec)

1. Open FireScope tab
2. Run `firescopeDemo.demo1_simpleQuery()`
3. Show request appearing in real-time
4. Expand JSON to show query details

### Scenario 2: Code Export (20 sec)

1. Run any demo query
2. Click export button on the request
3. Show dropdown with formats
4. Select "Angular Fire"
5. Show generated code

### Scenario 3: Collection Tracking (15 sec)

1. Run `firescopeDemo.demo4_multipleCollections()`
2. Click "Collections" button
3. Show collections list (Users, Posts, Comments)
4. Demonstrate filtering by collection

### Scenario 4: Complex Queries (25 sec)

1. Run `firescopeDemo.demo2_complexQuery()`
2. Show complex query with multiple filters
3. Expand to show structured query details
4. Highlight the where clauses and orderBy

## 🔧 Troubleshooting

### Firebase Connection Issues

```bash
# Check your Firebase config
echo "Checking .env file..."
cat .env

# Test Firebase config loading
node -r ./config/load-env.js -e "const { getFirebaseConfig } = require('./config/firebase-config.js'); console.log('Firebase config:', getFirebaseConfig());"

# Verify project ID matches Firestore rules
# Check browser console for auth errors
```

### Permission Issues

1. Go to Firestore Rules in Firebase Console
2. For demos, you can use test rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; // TEST ONLY - NOT FOR PRODUCTION
    }
  }
}
```

### Data Not Appearing

- Check browser console for errors
- Verify Firebase project ID in config
- Ensure Firestore is enabled in Firebase Console
- Check network tab for failed requests

## 🎨 Customizing Demo Data

### Adding Custom Collections

Edit `demo-seed-data.js` and add new seed functions:

```javascript
async function seedCustomCollection(count = 20) {
  console.log(`🎯 Seeding ${count} custom records...`);
  const batch = writeBatch(db);

  for (let i = 0; i < count; i++) {
    const customData = {
      id: `custom_${i + 1}`,
      // Your custom fields here
    };

    const docRef = doc(collection(db, 'custom'), customData.id);
    batch.set(docRef, customData);
  }

  await batch.commit();
  console.log('✅ Custom collection seeded');
}
```

### Modifying Existing Data

Adjust the data generation in existing seed functions to match your demo needs.

## 📈 Performance Tips

### For Large Datasets

- Use batched writes (already implemented)
- Limit concurrent operations
- Consider using Firebase Admin SDK for server-side seeding

### For Video Recording

- Pre-seed data before recording
- Use consistent data for reproducible demos
- Test the full demo flow before recording

## 🚀 Quick Demo Checklist

- [ ] Firebase project created and configured
- [ ] `.env` file created with your Firebase config
- [ ] Dependencies installed (`npm install`)
- [ ] Demo data seeded (`npm run demo:seed`)
- [ ] FireScope extension loaded in Chrome
- [ ] Demo operations script generated
- [ ] Test queries working in browser console
- [ ] Ready to record!

---

**Happy demoing! 🎬** This setup provides realistic, varied data that showcases all of FireScope's features effectively.
