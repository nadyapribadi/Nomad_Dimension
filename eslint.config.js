'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'Template/**',
      '.netlify/**',
      'Docs/**',
      '.gitnexus/**',
      'graphify-out/**',
      '_deploy/**',
    ],
  },
  js.configs.recommended,
  {
    // Netlify serverless functions — Node CommonJS
    files: ['functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // This config file itself
    files: ['eslint.config.js', 'prettier.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    // Repo scripts — Node ESM
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    // The app's client-side JavaScript lives inline in index.html, so ESLint
    // never picked it up. scripts/lint-inline.mjs extracts it and lints it under
    // this virtual filename, which does not exist on disk — naming index.html
    // here directly would make `eslint .` try to parse the HTML itself. Defect
    // rules take priority over style: the file has no module boundaries, so
    // style churn would bury the findings that matter.
    files: ['**/index.html.inline.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-cond-assign': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-unsafe-negation': 'error',
      'valid-typeof': 'error',
      'use-isnan': 'error',
      'no-sparse-arrays': 'error',
      'no-async-promise-executor': 'error',
      'no-global-assign': 'error',
      // Warnings, not errors: this is a 400 KB legacy script and the first job
      // is to make the real defects visible, not to block every commit on
      // forty unused locals.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': 'warn',
    },
  },
  {
    // Repo test scripts — Node CommonJS
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
