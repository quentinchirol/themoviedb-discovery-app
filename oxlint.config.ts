import { defineConfig } from 'oxlint';

export default defineConfig({
  plugins: ['typescript', 'unicorn', 'oxc', 'react'],
  ignorePatterns: ['dist/**', 'coverage/**'],
  categories: {
    correctness: 'error',
  },
  rules: {},
  env: {
    builtin: true,
  },
});
