import { expect, afterEach } from 'vitest';

// Ensure localStorage is available in jsdom environment
if (!globalThis.localStorage) {
  const store: Record<string, string> = {};

  globalThis.localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((key) => {
        delete store[key];
      });
    },
    key: (index: number) => Object.keys(store)[index] || null,
    length: Object.keys(store).length,
  } as Storage;
}

// Clear localStorage between tests
afterEach(() => {
  if (globalThis.localStorage) {
    globalThis.localStorage.clear();
  }
});
