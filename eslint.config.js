// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    files: ["tests/performance/**/*.js"],
    languageOptions: { globals: { __ENV: "readonly" } },
    settings: { "import/core-modules": ["k6", "k6/http"] },
  }
]);
