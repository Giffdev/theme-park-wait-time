import '@testing-library/jest-dom/vitest';

// Suppress Firebase console warnings in test output
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('Firebase') && msg.includes('already initialized')) return;
  originalWarn(...args);
};
