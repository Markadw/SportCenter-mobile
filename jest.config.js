module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  clearMocks: true,
  testTimeout: 15000,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'json-summary', 'lcov'],
  collectCoverageFrom: [
    'src/api/productsApi.ts',
    'src/api/catalogApi.ts',
    'src/features/catalog/context/FiltersContext.tsx',
    'src/features/products/context/ProductsContext.tsx',
    'src/features/products/screens/CatalogScreen.tsx',
    'src/features/products/screens/ProductDetailScreen.tsx',
  ],
};
