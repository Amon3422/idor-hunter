export default {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.test.js'
  ],
  // No transform needed — Node ESM handles modules natively
  transform: {},
};
