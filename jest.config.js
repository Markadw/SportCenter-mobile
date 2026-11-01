module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/tests/integration/**/*.test.tsx'],
  clearMocks: true,
  testTimeout: 15000,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'json-summary', 'lcov'],
  collectCoverageFrom: [
    'src/api/**/*.{ts,tsx}',
    'src/features/**/*.{ts,tsx}',
    'src/components/**/*.{ts,tsx}',
    'src/config/**/*.{ts,tsx}',
  ],
};
