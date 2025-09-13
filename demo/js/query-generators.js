// Demo Query Generators for FireScope Demo
// Extracted from demo/index.html and modularized

import {
  average,
  collection,
  collectionGroup,
  doc,
  getAggregateFromServer,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  sum,
  where,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

import { demoConfig } from '../demo-config.js';
import { db } from './firebase-init.js';
import { executeQuery } from './query-executor.js';
import { addLoading, removeLoading, showStatus } from './ui-utils.js';

// Demo User Queries
export async function demoUserQueries(button) {
  if (!db) {
    showStatus('Please initialize Firebase first', 'error');
    return;
  }

  if (button) addLoading(button);

  try {
    // Query 1: Active Users
    await executeQuery('Active Users Query', async () => {
      const q = query(
        collection(db, demoConfig.collections.Users),
        where('active', '==', true),
        limit(10)
      );
      return await getDocs(q);
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Query 2: Users by role
    await executeQuery('Admin Users Query', async () => {
      const q = query(
        collection(db, demoConfig.collections.Users),
        where('role', '==', 'admin'),
        orderBy('joinedAt', 'desc')
      );
      return await getDocs(q);
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Query 3: Recent Users
    await executeQuery('Recent Users Query', async () => {
      const q = query(
        collection(db, demoConfig.collections.Users),
        where('verified', '==', true),
        orderBy('joinedAt', 'desc'),
        limit(5)
      );
      return await getDocs(q);
    });
  } finally {
    if (button) removeLoading(button);
  }
}

// Demo Content Queries
export async function demoContentQueries(button) {
  if (!db) {
    showStatus('Please initialize Firebase first', 'error');
    return;
  }

  if (button) addLoading(button);

  try {
    // Query 1: Published Posts
    await executeQuery('Published Posts Query', async () => {
      const q = query(
        collection(db, demoConfig.collections.Posts),
        where('published', '==', true),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      return await getDocs(q);
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Aggregation: Count published posts
    await executeQuery('Published Posts Count (Aggregation)', async () => {
      const q = query(
        collection(db, demoConfig.collections.Posts),
        where('published', '==', true)
      );
      return await getCountFromServer(q);
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Aggregation: Sum and Average example (views)
    await executeQuery('Posts Sum/Average Views (Aggregation)', async () => {
      const q = query(
        collection(db, demoConfig.collections.Posts),
        where('published', '==', true)
      );
      // Labels are developer-chosen keys; snapshot.data() returns these keys
      return await getAggregateFromServer(q, {
        totalViews: sum('stats.views'),
        avgViews: average('stats.views'),
      });
    });
    
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Query 2: Posts by category
    await executeQuery('Technology Posts Query', async () => {
      const q = query(
        collection(db, demoConfig.collections.Posts),
        where('category', '==', 'technology'),
        where('status', '==', 'published'),
        orderBy('createdAt', 'desc')
      );
      return await getDocs(q);
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Query 3: Featured content
    await executeQuery('Featured Posts Query', async () => {
      const q = query(
        collection(db, demoConfig.collections.Posts),
        where('featured', '==', true),
        orderBy('stats.views', 'desc'),
        limit(5)
      );
      return await getDocs(q);
    });
  } finally {
    if (button) removeLoading(button);
  }
}

// Demo E-commerce Queries
export async function demoEcommerceQueries(button) {
  if (!db) {
    showStatus('Please initialize Firebase first', 'error');
    return;
  }

  if (button) addLoading(button);

  try {
    // Query 1: In-stock Products
    await executeQuery('In-Stock Products Query', async () => {
      const q = query(
        collection(db, demoConfig.collections.Products),
        where('inStock', '==', true),
        orderBy('price', 'asc'),
        limit(10)
      );
      return await getDocs(q);
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Aggregation: Count shipped orders
    await executeQuery('Shipped Orders Count (Aggregation)', async () => {
      const q = query(
        collection(db, demoConfig.collections.Orders),
        where('status', '==', 'shipped')
      );
      return await getCountFromServer(q);
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Aggregation: Sum/Average order totals
    await executeQuery('Orders Sum/Average Totals (Aggregation)', async () => {
      const q = query(
        collection(db, demoConfig.collections.Orders),
        where('status', 'in', ['processing', 'shipped'])
      );
      return await getAggregateFromServer(q, {
        sumTotal: sum('total'),
        avgTotal: average('total'),
      });
    });
    
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Query 2: Products by price range
    await executeQuery('Budget Products Query', async () => {
      const q = query(
        collection(db, demoConfig.collections.Products),
        where('price', '<=', 500),
        where('inStock', '==', true),
        orderBy('price', 'desc')
      );
      return await getDocs(q);
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Query 3: Recent Orders
    await executeQuery('Recent Orders Query', async () => {
      const q = query(
        collection(db, demoConfig.collections.Orders),
        where('status', 'in', ['processing', 'shipped']),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      return await getDocs(q);
    });
  } finally {
    if (button) removeLoading(button);
  }
}

// Demo Analytics Queries
export async function demoAnalyticsQueries(button) {
  if (!db) {
    showStatus('Please initialize Firebase first', 'error');
    return;
  }

  if (button) addLoading(button);

  try {
    // Query 1: Recent Analytics
    await executeQuery('Recent Analytics Query', async () => {
      const q = query(
        collection(db, demoConfig.collections.Analytics),
        orderBy('date', 'desc'),
        limit(7)
      );
      return await getDocs(q);
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Aggregation: Count high traffic days
    await executeQuery('High Traffic Days Count (Aggregation)', async () => {
      const q = query(
        collection(db, demoConfig.collections.Analytics),
        where('metrics.pageViews', '>', 5000)
      );
      return await getCountFromServer(q);
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Aggregation: Average page views
    await executeQuery('Average Page Views (Aggregation)', async () => {
      const q = query(collection(db, demoConfig.collections.Analytics));
      return await getAggregateFromServer(q, {
        avgPageViews: average('metrics.pageViews'),
      });
    });
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    // Query 2: High traffic days
    await executeQuery('High Traffic Analytics Query', async () => {
      const q = query(
        collection(db, demoConfig.collections.Analytics),
        where('metrics.pageViews', '>', 5000),
        orderBy('metrics.pageViews', 'desc')
      );
      return await getDocs(q);
    });
  } finally {
    if (button) removeLoading(button);
  }
}

// Demo Advanced Queries
export async function demoAdvancedQueries(button) {
  if (!db) {
    showStatus('Please initialize Firebase first', 'error');
    return;
  }

  if (button) addLoading(button);

  try {
    // Query 1: Array contains
    await executeQuery('Posts with Tags Query', async () => {
      const q = query(
        collection(db, demoConfig.collections.Posts),
        where('tags', 'array-contains', 'javascript'),
        limit(5)
      );
      return await getDocs(q);
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Query 2: Multiple collections in parallel
    await executeQuery('Multi-Collection Query', async () => {
      const [Users, Posts, Comments] = await Promise.all([
        getDocs(query(collection(db, demoConfig.collections.Users), limit(3))),
        getDocs(query(collection(db, demoConfig.collections.Posts), limit(3))),
        getDocs(
          query(
            collection(db, demoConfig.collections.Comments),
            where('approved', '==', true),
            limit(3)
          )
        ),
      ]);

      return {
        size: Users.size + Posts.size + Comments.size,
        Users: Users.size,
        Posts: Posts.size,
        Comments: Comments.size,
      };
    });
  } finally {
    if (button) removeLoading(button);
  }
}

// Demo Document Operations
export async function demoDocumentOperations(button) {
  if (!db) {
    showStatus('Please initialize Firebase first', 'error');
    return;
  }

  if (button) addLoading(button);

  try {
    // Query 1: Get specific user
    await executeQuery('Get User Document', async () => {
      const docRef = doc(db, demoConfig.collections.Users, 'user_1');
      return await getDoc(docRef);
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Query 2: Get specific post
    await executeQuery('Get Post Document', async () => {
      const docRef = doc(db, demoConfig.collections.Posts, 'post_1');
      return await getDoc(docRef);
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Query 3: Get specific product
    await executeQuery('Get Product Document', async () => {
      const docRef = doc(db, demoConfig.collections.Products, 'product_1');
      return await getDoc(docRef);
    });
  } finally {
    if (button) removeLoading(button);
  }
}

// Demo Collection Group Queries
export async function demoCollectionGroupQueries(button) {
  if (!db) {
    showStatus('Please initialize Firebase first', 'error');
    return;
  }
  if (button) addLoading(button);
  try {
    // Approved comments across all posts (collection group)
    await executeQuery('CG: Approved Comments', async () => {
      const q = query(
        collectionGroup(db, 'Comments'),
        where('approved', '==', true),
        limit(10)
      );
      return await getDocs(q);
    });

    await new Promise(r => setTimeout(r, 1200));

    // Most liked comments across all posts
    await executeQuery('CG: Top Liked Comments', async () => {
      const q = query(
        collectionGroup(db, 'Comments'),
        orderBy('likes', 'desc'),
        limit(5)
      );
      return await getDocs(q);
    });
  } finally {
    if (button) removeLoading(button);
  }
}

// Demo Aggregations Suite
export async function demoAggregations(button) {
  if (!db) {
    showStatus('Please initialize Firebase first', 'error');
    return;
  }
  if (button) addLoading(button);
  try {
    // Posts: count published
    await executeQuery('Aggregations: Published Posts Count', async () => {
      const q = query(
        collection(db, demoConfig.collections.Posts),
        where('published', '==', true)
      );
      return await getCountFromServer(q);
    });

    await new Promise(r => setTimeout(r, 1000));

    // Posts: sum/avg views
    await executeQuery('Aggregations: Posts Sum/Average Views', async () => {
      const q = query(
        collection(db, demoConfig.collections.Posts),
        where('published', '==', true)
      );
      return await getAggregateFromServer(q, {
        totalViews: sum('stats.views'),
        avgViews: average('stats.views'),
      });
    });

    await new Promise(r => setTimeout(r, 1000));

    // Orders: count shipped
    await executeQuery('Aggregations: Shipped Orders Count', async () => {
      const q = query(
        collection(db, demoConfig.collections.Orders),
        where('status', '==', 'shipped')
      );
      return await getCountFromServer(q);
    });

    await new Promise(r => setTimeout(r, 1000));

    // Orders: sum/avg total
    await executeQuery('Aggregations: Orders Sum/Average Totals', async () => {
      const q = query(
        collection(db, demoConfig.collections.Orders),
        where('status', 'in', ['processing', 'shipped'])
      );
      return await getAggregateFromServer(q, {
        sumTotal: sum('total'),
        avgTotal: average('total'),
      });
    });

    await new Promise(r => setTimeout(r, 1000));

    // Analytics: average page views
    await executeQuery('Aggregations: Average Page Views', async () => {
      const q = query(collection(db, demoConfig.collections.Analytics));
      return await getAggregateFromServer(q, {
        avgPageViews: average('metrics.pageViews'),
      });
    });
  } finally {
    if (button) removeLoading(button);
  }
}

// Auto Demo Functionality
let autoInterval = null;
let isRunning = false;

export async function startAutoDemo() {
  if (!db) {
    showStatus('Please initialize Firebase first', 'error');
    return;
  }

  if (isRunning) {
    showStatus('Auto demo is already running', 'error');
    return;
  }

  isRunning = true;
  showStatus('🎬 Auto demo sequence started', 'info');

  const demoFunctions = [
    demoUserQueries,
    demoContentQueries,
    demoEcommerceQueries,
    demoDocumentOperations,
    demoAdvancedQueries,
    demoAnalyticsQueries,
    demoAggregations
  ];

  let currentIndex = 0;

  autoInterval = setInterval(async () => {
    if (currentIndex >= demoFunctions.length) {
      currentIndex = 0; // Loop back to start
    }

    try {
      await demoFunctions[currentIndex]();
      currentIndex++;
    } catch (error) {
      console.error('Auto demo error:', error);
    }
  }, demoConfig.autoDelay); // Use config value

  // Run first demo immediately
  setTimeout(() => demoFunctions[0](), 1000);
}

export function stopAutoDemo() {
  if (autoInterval) {
    clearInterval(autoInterval);
    autoInterval = null;
    isRunning = false;
    showStatus('⏹️ Auto demo sequence stopped', 'info');
  }
}

// Export all functions as a convenience object
export const queryGenerators = {
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
