const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  { ignores: ['node_modules/**', '.expo/**', 'dist/**', 'web-build/**', 'coverage/**', 'test-results/**'] },
  expoConfig,
  {
    files: ['scripts/**/*.{js,cjs}', '*.config.js'],
    languageOptions: {
      globals: { __dirname: 'readonly', module: 'readonly', require: 'readonly',
        process: 'readonly', Buffer: 'readonly', console: 'readonly' },
    },
  },
  {
    files: ['tests/api/**/*.test.js'],
    languageOptions: { globals: { beforeAll: 'readonly', describe: 'readonly', test: 'readonly', expect: 'readonly' } },
  },
  {
    files: ['tests/performance/**/*.js'],
    languageOptions: { globals: { __ENV: 'readonly' } },
    settings: { 'import/core-modules': ['k6', 'k6/http'] },
  },
]);
