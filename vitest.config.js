import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/unit/**/*.test.js'],
  },
  // Mirror the edition aliases from vite.config.js so a test can import a module
  // that pulls in '#nav-button' or '#more-menu'. Without this, any such import
  // fails to resolve under Vitest even though it builds fine. The free targets
  // are used because 'free' is the default edition in vite.config.js; tests that
  // care about the Pro variant import it by path.
  resolve: {
    alias: {
      '#nav-button': resolve(__dirname, 'src/js/nav-button.js'),
      '#more-menu': resolve(__dirname, 'src/js/more-menu.js'),
    },
  },
});
