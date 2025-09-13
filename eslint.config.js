import js from '@eslint/js';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.vscode/**',
      '.git/**',
      'demo/firebase-env.js', // Ignore auto-generated file
    ],
  },
  js.configs.recommended,
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: {
        // Test framework globals
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        fetch: 'readonly',
      },
    },
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
        requestAnimationFrame: 'readonly',
        TextDecoder: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',

        // Chrome extension globals
        chrome: 'readonly',

        // Node.js globals (for scripts)
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',

        // Demo-specific globals
        demoConfig: 'readonly',
      },
    },
    rules: {
      // Customize rules as needed
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off', // Allow console for extension debugging
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
