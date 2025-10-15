import { defineConfig, loadEnv } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import manifestFree from './config/manifest.free.json' with { type: 'json' };
import manifestPro from './config/manifest.pro.json' with { type: 'json' };
import pkg from './package.json' with { type: 'json' };

export default defineConfig(({ mode }) => {
  // Load env from .env, .env.[mode], etc.
  const env = loadEnv(mode, process.cwd(), '');
  const edition = env.EDITION || process.env.EDITION || 'free';

  // Pick manifest and sync version to package.json
  const baseManifest =
    edition === 'pro' ? { ...manifestPro } : { ...manifestFree };
  baseManifest.version = pkg.version;

  return {
    plugins: [
      crx({
        manifest: baseManifest,
      }),
    ],

    // Build configuration
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // Generate source maps for debugging
      sourcemap: true,
      // Target modern Chrome versions
      target: 'chrome88',
      minify: process.env.NODE_ENV === 'production' ? 'terser' : false,
      terserOptions: {
        format: { comments: false },
        compress: {
          // In free builds, strip console to avoid any Pro mentions in output
          drop_console: edition === 'free',
          drop_debugger: edition === 'free',
        },
      },
      rollupOptions: {
        input: {
          // Ensure panel.html is included in the build
          panel: resolve(__dirname, 'src/panel.html'),
          // CSS files
          panelCss: resolve(__dirname, 'src/css/panel.css'),
        },
      },
    },

    // Resolve configuration
    resolve: {
      alias: {
        '@': '/src',
        '#nav-button':
          edition === 'pro'
            ? resolve(__dirname, 'src/js/nav-button.pro.js')
            : resolve(__dirname, 'src/js/nav-button.js'),
        '#more-menu':
          edition === 'pro'
            ? resolve(__dirname, 'src/js/more-menu.pro.js')
            : resolve(__dirname, 'src/js/more-menu.js'),
      },
    },

    // Define global constants
    define: {
      __DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
      'import.meta.env.VITE_EDITION': JSON.stringify(edition),
      // Do not override import.meta.env.VITE_PRO_API_BASE; Vite injects it from .env
    },
  };
});
