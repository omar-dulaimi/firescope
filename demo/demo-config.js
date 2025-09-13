// Demo configuration for FireScope Demo
// This file is version controlled and contains non-sensitive demo settings

export const demoConfig = {
  // Delay between auto demo operations (milliseconds)
  autoDelay: 8000,

  // Number of documents to fetch in demo queries
  queryLimits: {
    small: 5,
    medium: 10,
    large: 20,
  },

  // Collections to use in demos (must exist in your Firestore)
  collections: {
    Users: 'Users',
    Posts: 'Posts',
    Products: 'Products',
    Orders: 'Orders',
    Comments: 'Comments',
    Analytics: 'Analytics',
  },

  // Demo query variations
  demoData: {
    categories: ['technology', 'business', 'tutorial', 'review'],
    roles: ['admin', 'user', 'moderator', 'editor'],
    tags: ['javascript', 'react', 'firebase', 'nodejs'],
    statuses: ['draft', 'published', 'archived'],
  },
};
