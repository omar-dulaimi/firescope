#!/usr/bin/env node

/**
 * FireScope Demo Seed Data Generator
 * Creates realistic Firestore data for demonstration purposes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getFirestore,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { loadEnv } from '../config/load-env.js';
import { getFirebaseConfig } from '../config/firebase-config.js';
import { demoConfig } from './demo-config.js';
import {
  firstNames,
  lastNames,
  companies,
  categories,
  tags,
  statuses,
  productNames,
  brands,
} from './data/sample-data.js';

// Load environment variables
loadEnv();

// Get Firebase configuration from centralized config
const firebaseConfig = getFirebaseConfig();

// Initialize Firebase
let app, db;
try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  console.log('🔥 Firebase initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization failed:', error.message);
  console.log(
    '💡 Please update your .env file with actual Firebase project settings'
  );
  process.exit(1);
}

/**
 * Generate random data helpers
 */
const randomChoice = array => array[Math.floor(Math.random() * array.length)];
const randomNumber = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const randomBoolean = () => Math.random() > 0.5;

// Sample data pools imported from data/sample-data.js

// Arrays to store generated document IDs for cross-collection referencing
let seededUserIds = [];
let seededPostIds = [];
let seededCommentIds = [];
let seededProductIds = [];
let seededOrderIds = [];

/**
 * Generate realistic timestamps
 */
const getRandomTimestamp = (daysAgo = 30) => {
  const now = new Date();
  const pastDate = new Date(
    now.getTime() - Math.random() * daysAgo * 24 * 60 * 60 * 1000
  );
  return Timestamp.fromDate(pastDate);
};

/**
 * Seed Users Collection
 */
async function seedUsers(count = 50) {
  console.log(`👥 Seeding ${count} Users...`);
  const batch = writeBatch(db);
  seededUserIds = []; // Clear previous IDs

  for (let i = 0; i < count; i++) {
    const userRef = doc(collection(db, demoConfig.collections.Users)); // Auto-generate ID
    const firstName = randomChoice(firstNames);
    const lastName = randomChoice(lastNames);
    const userData = {
      id: userRef.id, // Use the auto-generated ID
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      username: `${firstName.toLowerCase()}${lastName.toLowerCase()}${randomNumber(
        1,
        999
      )}`,
      active: randomBoolean(),
      verified: randomBoolean(),
      role: randomChoice(['user', 'admin', 'moderator', 'editor']),
      company: randomChoice(companies),
      department: randomChoice([
        'Engineering',
        'Marketing',
        'Sales',
        'Support',
        'HR',
      ]),
      age: randomNumber(22, 65),
      joinedAt: getRandomTimestamp(365),
      lastLogin: getRandomTimestamp(7),
      settings: {
        notifications: randomBoolean(),
        theme: randomChoice(['light', 'dark', 'auto']),
        language: randomChoice(['en', 'es', 'fr', 'de', 'ja']),
        timezone: randomChoice(['UTC', 'PST', 'EST', 'GMT', 'JST']),
      },
      stats: {
        postsCount: randomNumber(0, 50),
        commentsCount: randomNumber(0, 200),
        likesReceived: randomNumber(0, 1000),
      },
    };

    batch.set(userRef, userData);
    seededUserIds.push(userRef.id); // Store the generated ID
  }

  // Ensure a predictable user for doc lookup demos
  {
    const userRef = doc(collection(db, demoConfig.collections.Users), 'user_1');
    const firstName = randomChoice(firstNames);
    const lastName = randomChoice(lastNames);
    const userData = {
      id: userRef.id,
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      username: `${firstName.toLowerCase()}${lastName.toLowerCase()}1`,
      active: true,
      verified: true,
      role: 'user',
      company: randomChoice(companies),
      department: randomChoice(['Engineering', 'Marketing', 'Sales', 'Support', 'HR']),
      age: randomNumber(22, 65),
      joinedAt: getRandomTimestamp(365),
      lastLogin: getRandomTimestamp(7),
      settings: {
        notifications: true,
        theme: 'auto',
        language: 'en',
        timezone: 'UTC',
      },
      stats: {
        postsCount: 3,
        commentsCount: 5,
        likesReceived: 42,
      },
    };
    batch.set(userRef, userData);
    seededUserIds.push(userRef.id);
  }

  await batch.commit();
  console.log('✅ Users seeded successfully');
}

/**
 * Seed Posts Collection
 */
async function seedPosts(count = 100) {
  console.log(`📝 Seeding ${count} Posts...`);
  const batch = writeBatch(db);
  seededPostIds = []; // Clear previous IDs

  // Ensure Users are seeded before Posts
  if (seededUserIds.length === 0) {
    console.warn('⚠️ No Users seeded. Seeding Users first...');
    await seedUsers(); // Seed default number of Users if not already seeded
  }

  for (let i = 0; i < count; i++) {
    const postRef = doc(collection(db, demoConfig.collections.Posts)); // Auto-generate ID
    const postData = {
      id: postRef.id, // Use the auto-generated ID
      title: `Sample Post Title ${i + 1}: ${randomChoice([
        'Building',
        'Understanding',
        'Exploring',
        'Mastering',
        'Debugging',
      ])} ${randomChoice([
        'Modern Apps',
        'Cloud Services',
        'Web Technologies',
        'Mobile Solutions',
        'Database Design',
      ])}`,
      content: `This is the content for post ${
        i + 1
      }. It contains detailed information about the topic and provides valuable insights for readers. The content is comprehensive and well-structured.`,
      excerpt: `Brief summary of post ${
        i + 1
      } covering the main points and key takeaways.`,
      authorId: randomChoice(seededUserIds), // Use a random user ID from the seeded Users
      category: randomChoice(categories),
      tags: Array.from({ length: randomNumber(2, 5) }, () =>
        randomChoice(tags)
      ),
      status: randomChoice(statuses),
      published: randomBoolean(),
      featured: randomBoolean(),
      createdAt: getRandomTimestamp(90),
      updatedAt: getRandomTimestamp(30),
      publishedAt: randomBoolean() ? getRandomTimestamp(60) : null,
      stats: {
        views: randomNumber(0, 10000),
        likes: randomNumber(0, 500),
        shares: randomNumber(0, 100),
        Comments: randomNumber(0, 50),
      },
      seo: {
        metaTitle: `SEO Title for Post ${i + 1}`,
        metaDescription: `SEO description for post ${i + 1}`,
        slug: `sample-post-${i + 1}-${randomChoice([
          'tech',
          'business',
          'tutorial',
        ])}`,
      },
    };

    batch.set(postRef, postData);
    seededPostIds.push(postRef.id); // Store the generated ID

    // Seed a few subcollection comments under each post to support collection group queries
    const subCount = randomNumber(0, 3);
    for (let s = 0; s < subCount; s++) {
      const subCommentRef = doc(
        collection(db, demoConfig.collections.Posts, postRef.id, 'Comments')
      );
      const subCommentData = {
        id: subCommentRef.id,
        postId: postRef.id,
        authorId: randomChoice(seededUserIds),
        content: `Nested comment ${s + 1} on post ${postRef.id}`,
        approved: randomBoolean(),
        createdAt: getRandomTimestamp(30),
        likes: randomNumber(0, 25),
      };
      batch.set(subCommentRef, subCommentData);
    }
  }

  // Ensure a predictable post for doc lookup demos
  {
    const postRef = doc(collection(db, demoConfig.collections.Posts), 'post_1');
    const postData = {
      id: postRef.id,
      title: `Sample Post Title (fixed)`,
      content: `This is a fixed seeded post for doc lookup demos`,
      excerpt: `Fixed seeded post`,
      authorId: randomChoice(seededUserIds),
      category: randomChoice(categories),
      tags: Array.from({ length: 3 }, () => randomChoice(tags)),
      status: randomChoice(statuses),
      published: true,
      featured: false,
      createdAt: getRandomTimestamp(90),
      updatedAt: getRandomTimestamp(30),
      publishedAt: getRandomTimestamp(60),
      stats: { views: 10, likes: 1, shares: 0, Comments: 0 },
      seo: { metaTitle: 'SEO Title (fixed)', metaDescription: 'SEO description (fixed)', slug: 'fixed-post-1' },
    };
    batch.set(postRef, postData);
    seededPostIds.push(postRef.id);
  }

  await batch.commit();
  console.log('✅ Posts seeded successfully');
}

/**
 * Seed Comments Collection
 */
async function seedComments(count = 200) {
  console.log(`💬 Seeding ${count} Comments...`);
  const batch = writeBatch(db);
  seededCommentIds = []; // Clear previous IDs

  // Ensure Posts and Users are seeded
  if (seededPostIds.length === 0) {
    console.warn('⚠️ No Posts seeded. Seeding Posts first...');
    await seedPosts();
  }
  if (seededUserIds.length === 0) {
    console.warn('⚠️ No Users seeded. Seeding Users first...');
    await seedUsers();
  }

  for (let i = 0; i < count; i++) {
    const commentRef = doc(collection(db, demoConfig.collections.Comments)); // Auto-generate ID
    const commentData = {
      id: commentRef.id, // Use the auto-generated ID
      postId: randomChoice(seededPostIds), // Use a random post ID
      authorId: randomChoice(seededUserIds), // Use a random user ID
      content: `This is a sample comment ${
        i + 1
      }. It provides thoughtful feedback and adds value to the discussion.`,
      approved: randomBoolean(),
      flagged: randomBoolean(),
      createdAt: getRandomTimestamp(60),
      updatedAt: getRandomTimestamp(30),
      likes: randomNumber(0, 50),
      replies: randomNumber(0, 10),
      parentId:
        randomBoolean() && seededCommentIds.length > 0
          ? randomChoice(seededCommentIds)
          : null, // Use a random existing comment ID for parent, if any
    };

    batch.set(commentRef, commentData);
    seededCommentIds.push(commentRef.id); // Store the generated ID
  }

  await batch.commit();
  console.log('✅ Comments seeded successfully');
}

/**
 * Seed Products Collection (for e-commerce demos)
 */
async function seedProducts(count = 30) {
  console.log(`🛍️ Seeding ${count} Products...`);
  const batch = writeBatch(db);
  seededProductIds = []; // Clear previous IDs

  // Using imported productNames and brands from sample-data.js

  for (let i = 0; i < count; i++) {
    const productRef = doc(collection(db, demoConfig.collections.Products)); // Auto-generate ID
    const productData = {
      id: productRef.id, // Use the auto-generated ID
      name: `${randomChoice(productNames)} ${randomChoice([
        'Pro',
        'Max',
        'Ultra',
        'Plus',
        'Standard',
      ])}`,
      brand: randomChoice(brands),
      category: randomChoice([
        'Electronics',
        'Computers',
        'Mobile',
        'Audio',
        'Gaming',
      ]),
      price: randomNumber(50, 2000),
      originalPrice: randomNumber(60, 2200),
      currency: 'USD',
      inStock: randomBoolean(),
      quantity: randomNumber(0, 100),
      rating: randomNumber(30, 50) / 10,
      reviewsCount: randomNumber(0, 1000),
      description: `High-quality ${randomChoice(
        productNames
      )} with advanced features and excellent performance.`,
      features: Array.from(
        { length: randomNumber(3, 6) },
        (_, idx) => `Feature ${idx + 1}`
      ),
      tags: Array.from({ length: randomNumber(2, 4) }, () =>
        randomChoice(['bestseller', 'new', 'sale', 'premium', 'popular'])
      ),
      createdAt: getRandomTimestamp(180),
      updatedAt: getRandomTimestamp(30),
      sales: {
        totalSold: randomNumber(0, 500),
        revenue: randomNumber(1000, 50000),
      },
    };

    batch.set(productRef, productData);
    seededProductIds.push(productRef.id); // Store the generated ID
  }

  // Ensure a predictable product for doc lookup demos
  {
    const productRef = doc(collection(db, demoConfig.collections.Products), 'product_1');
    const productData = {
      id: productRef.id,
      name: `${randomChoice(productNames)} Standard`,
      brand: randomChoice(brands),
      category: randomChoice(['Electronics', 'Computers', 'Mobile', 'Audio', 'Gaming']),
      price: randomNumber(50, 2000),
      originalPrice: randomNumber(60, 2200),
      currency: 'USD',
      inStock: true,
      quantity: randomNumber(1, 50),
      rating: randomNumber(30, 50) / 10,
      reviewsCount: randomNumber(0, 1000),
      description: 'Fixed seeded product for doc lookup demos',
      features: ['Feature A', 'Feature B', 'Feature C'],
      tags: ['bestseller', 'demo'],
      createdAt: getRandomTimestamp(180),
      updatedAt: getRandomTimestamp(30),
      sales: { totalSold: randomNumber(0, 500), revenue: randomNumber(1000, 50000) },
    };
    batch.set(productRef, productData);
    seededProductIds.push(productRef.id);
  }

  await batch.commit();
  console.log('✅ Products seeded successfully');
}

/**
 * Seed Orders Collection
 */
async function seedOrders(count = 75) {
  console.log(`📦 Seeding ${count} Orders...`);
  const batch = writeBatch(db);
  seededOrderIds = []; // Clear previous IDs

  // Ensure Users and Products are seeded
  if (seededUserIds.length === 0) {
    console.warn('⚠️ No Users seeded. Seeding Users first...');
    await seedUsers();
  }
  if (seededProductIds.length === 0) {
    console.warn('⚠️ No Products seeded. Seeding Products first...');
    await seedProducts();
  }

  for (let i = 0; i < count; i++) {
    const orderRef = doc(collection(db, demoConfig.collections.Orders)); // Auto-generate ID
    const orderData = {
      id: orderRef.id, // Use the auto-generated ID
      userId: randomChoice(seededUserIds), // Use a random user ID
      status: randomChoice([
        'pending',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
      ]),
      total: randomNumber(25, 500),
      subtotal: randomNumber(20, 450),
      tax: randomNumber(2, 45),
      shipping: randomNumber(0, 25),
      currency: 'USD',
      items: Array.from({ length: randomNumber(1, 5) }, () => ({
        productId: randomChoice(seededProductIds), // Use a random product ID
        quantity: randomNumber(1, 3),
        price: randomNumber(25, 200),
      })),
      createdAt: getRandomTimestamp(90),
      updatedAt: getRandomTimestamp(30),
      shippingAddress: {
        street: `${randomNumber(100, 9999)} ${randomChoice([
          'Main',
          'Oak',
          'Pine',
          'Elm',
        ])} St`,
        city: randomChoice([
          'New York',
          'Los Angeles',
          'Chicago',
          'Houston',
          'Phoenix',
        ]),
        state: randomChoice(['NY', 'CA', 'IL', 'TX', 'AZ']),
        zip: randomNumber(10000, 99999).toString(),
        country: 'USA',
      },
    };

    batch.set(orderRef, orderData);
    seededOrderIds.push(orderRef.id); // Store the generated ID
  }

  await batch.commit();
  console.log('✅ Orders seeded successfully');
}

/**
 * Seed Analytics Collection (for demonstration of time-series data)
 */
async function seedAnalytics(count = 365) {
  console.log(`📊 Seeding ${count} Analytics records...`);

  // Use multiple batches for large datasets
  const batchSize = 100;
  const batches = Math.ceil(count / batchSize);

  for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
    const batch = writeBatch(db);
    const startIndex = batchIndex * batchSize;
    const endIndex = Math.min(startIndex + batchSize, count);

    for (let i = startIndex; i < endIndex; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (count - i));

      const analyticsRef = doc(
        collection(db, demoConfig.collections.Analytics)
      ); // Auto-generate ID
      const analyticsData = {
        id: analyticsRef.id, // Use the auto-generated ID
        date: Timestamp.fromDate(date),
        metrics: {
          pageViews: randomNumber(1000, 10000),
          uniqueVisitors: randomNumber(500, 5000),
          sessions: randomNumber(800, 8000),
          bounceRate: randomNumber(20, 80),
          avgSessionDuration: randomNumber(60, 600),
        },
        traffic: {
          organic: randomNumber(100, 1000),
          direct: randomNumber(50, 500),
          social: randomNumber(25, 250),
          referral: randomNumber(10, 100),
          email: randomNumber(15, 150),
        },
        conversions: {
          signups: randomNumber(5, 50),
          purchases: randomNumber(1, 25),
          revenue: randomNumber(100, 5000),
        },
      };

      batch.set(analyticsRef, analyticsData);
    }

    await batch.commit();
    console.log(`✅ Analytics batch ${batchIndex + 1}/${batches} completed`);
  }

  console.log('✅ Analytics seeded successfully');
}

/**
 * Create demo operations script for live demonstrations
 */
async function createDemoOperations() {
  console.log('🎬 Creating demo operations script...');

  const demoScript = `
// FireScope Demo Operations
// Copy and paste these into browser console during recordings

import { getFirestore, collection, query, where, orderBy, limit, getDocs, doc, getDoc, startAfter } from 'firebase/firestore';
const db = getFirestore();

// Demo Operation 1: Simple Query
async function demo1_simpleQuery() {
  console.log('🔍 Demo 1: Simple user query');
  const q = query(collection(db, demoConfig.collections.Users), where('active', '==', true));
  const snapshot = await getDocs(q);
  console.log('Found active Users:', snapshot.size);
  return snapshot;
}

// Demo Operation 2: Complex Query with Multiple Filters
async function demo2_complexQuery() {
  console.log('🔍 Demo 2: Complex post query');
  const q = query(
    collection(db, demoConfig.collections.Posts),
    where('published', '==', true),
    where('category', '==', 'technology'),
    orderBy('createdAt', 'desc'),
    limit(10)
  );
  const snapshot = await getDocs(q);
  console.log('Found tech Posts:', snapshot.size);
  return snapshot;
}

// Demo Operation 3: Document Lookup
async function demo3_documentLookup() {
  console.log('🔍 Demo 3: Single user lookup');
  let userIdToLookup = 'user_1'; // Fallback
  if (seededUserIds.length > 0) {
    userIdToLookup = randomChoice(seededUserIds);
  } else {
    console.warn("⚠️ No Users seeded. Cannot perform document lookup with a real ID. Using fallback 'user_1'.");
  }
  const docRef = doc(db, demoConfig.collections.Users, userIdToLookup);
  const docSnap = await getDoc(docRef);
  console.log('User found:', docSnap.exists());
  return docSnap;
}

// Demo Operation 4: Multiple Collections
async function demo4_multipleCollections() {
  console.log('🔍 Demo 4: Multiple collection queries');
  const [Users, Posts, Comments] = await Promise.all([
    getDocs(query(collection(db, demoConfig.collections.Users), limit(5))),
    getDocs(query(collection(db, demoConfig.collections.Posts), where('featured', '==', true))),
    getDocs(query(collection(db, demoConfig.collections.Comments), where('approved', '==', true), limit(10)))
  ]);
  console.log('Results:', { Users: Users.size, Posts: Posts.size, Comments: Comments.size });
  return { Users, Posts, Comments };
}

// Demo Operation 5: E-commerce Query
async function demo5_ecommerceQuery() {
  console.log('🔍 Demo 5: Product search');
  const q = query(
    collection(db, demoConfig.collections.Products),
    where('inStock', '==', true),
    where('price', '<=', 500),
    orderBy('price', 'desc'),
    limit(8)
  );
  const snapshot = await getDocs(q);
  console.log('Products in budget:', snapshot.size);
  return snapshot;
}

// Demo Operation 6: Analytics Query
async function demo6_analyticsQuery() {
  console.log('🔍 Demo 6: Recent Analytics');
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const q = query(
    collection(db, demoConfig.collections.Analytics),
    where('date', '>=', thirtyDaysAgo),
    orderBy('date', 'desc')
  );
  const snapshot = await getDocs(q);
  console.log('Analytics records:', snapshot.size);
  return snapshot;
}

// Auto-run demo sequence (useful for video recording)
async function runDemoSequence() {
  console.log('🎬 Starting FireScope demo sequence...');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  await demo1_simpleQuery();
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  await demo2_complexQuery();
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  await demo3_documentLookup();
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  await demo4_multipleCollections();
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  await demo5_ecommerceQuery();
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  await demo6_analyticsQuery();
  
  console.log('✅ Demo sequence completed!');
}

// Export functions for manual use
window.firescopeDemo = {
  demo1_simpleQuery,
  demo2_complexQuery,
  demo3_documentLookup,
  demo4_multipleCollections,
  demo5_ecommerceQuery,
  demo6_analyticsQuery,
  runDemoSequence
};

console.log('🔥 FireScope demo operations loaded!');
console.log('Available functions:', Object.keys(window.firescopeDemo));
console.log('Run: firescopeDemo.runDemoSequence() for automated demo');
`;

  // Write demo script to file
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const outputPath = path.join(__dirname, '../demo-operations.js');
    fs.writeFileSync(outputPath, demoScript, 'utf8');
    console.log('✅ Demo operations script created: demo-operations.js');
  } catch (error) {
    console.warn('⚠️ Could not create demo operations script:', error.message);
  }
}

/**
 * Main seeding function
 */
async function seedAll() {
  console.log('🌱 Starting FireScope demo database seeding...');
  console.log('==========================================\n');

  const startTime = Date.now();

  try {
    // Seed all collections
    await seedUsers(50);
    await seedPosts(100);
    await seedComments(200);
    await seedProducts(30);
    await seedOrders(75);
    await seedAnalytics(30); // Last 30 days of Analytics

    // Create demo operations script
    await createDemoOperations();

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log('\n🎉 Database seeding completed successfully!');
    console.log(`⏱️  Total time: ${duration}s`);
    console.log('\n📊 Data Summary:');
    console.log('  👥 Users: 50');
    console.log('  📝 Posts: 100');
    console.log('  💬 Comments: 200');
    console.log('  🛍️  Products: 30');
    console.log('  📦 Orders: 75');
    console.log('  📊 Analytics: 30 days');
    console.log('\n🎬 Ready for FireScope demos!');
    console.log('💡 Use demo-operations.js for live demonstrations');
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  }
}

/**
 * CLI Interface
 */
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'Users':
    await seedUsers(parseInt(args[1]) || 50);
    break;
  case 'Posts':
    await seedPosts(parseInt(args[1]) || 100);
    break;
  case 'Comments':
    await seedComments(parseInt(args[1]) || 200);
    break;
  case 'Products':
    await seedProducts(parseInt(args[1]) || 30);
    break;
  case 'Orders':
    await seedOrders(parseInt(args[1]) || 75);
    break;
  case 'Analytics':
    await seedAnalytics(parseInt(args[1]) || 30);
    break;
  case 'demo-script':
    await createDemoOperations();
    break;
  case 'all':
  case undefined:
    await seedAll();
    break;
  default:
    console.log(`
🌱 FireScope Demo Seed Data Generator

Usage:
  node demo-seed-data.js [command] [count]

Commands:
  all              Seed all collections (default)
  Users [count]    Seed Users collection (default: 50)
  Posts [count]    Seed Posts collection (default: 100)
  Comments [count] Seed Comments collection (default: 200)
  Products [count] Seed Products collection (default: 30)
  Orders [count]   Seed Orders collection (default: 75)
  Analytics [days] Seed Analytics collection (default: 30 days)
  demo-script      Create demo operations script only

Examples:
  node demo-seed-data.js
  node demo-seed-data.js Users 25
  node demo-seed-data.js Posts 50
  node demo-seed-data.js all
    `);
}

process.exit(0);
