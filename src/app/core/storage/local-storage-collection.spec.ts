import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createLocalStorageCollection } from './local-storage-collection';

// Polyfill localStorage for test environment
if (typeof globalThis !== 'undefined' && !globalThis.localStorage) {
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

interface TestItem {
  id: string;
  label: string;
}

@Injectable()
class TestCollectionHarness {
  readonly collection = createLocalStorageCollection<TestItem>('test:items');
}

describe('createLocalStorageCollection', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [TestCollectionHarness] });
  });

  it('starts empty when localStorage has no entry for the key', () => {
    const harness = TestBed.inject(TestCollectionHarness);
    expect(harness.collection.items()).toEqual([]);
  });

  it('loads existing items from localStorage on creation', () => {
    localStorage.setItem('test:items', JSON.stringify([{ id: '9', label: 'Existing' }]));
    const harness = TestBed.inject(TestCollectionHarness);
    expect(harness.collection.items()).toEqual([{ id: '9', label: 'Existing' }]);
  });

  it('adds an item and exposes it via items()', () => {
    const harness = TestBed.inject(TestCollectionHarness);
    harness.collection.add({ id: '1', label: 'First' });
    expect(harness.collection.items()).toEqual([{ id: '1', label: 'First' }]);
  });

  it('persists added items to localStorage', () => {
    const harness = TestBed.inject(TestCollectionHarness);
    harness.collection.add({ id: '1', label: 'First' });
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('test:items')!)).toEqual([
      { id: '1', label: 'First' },
    ]);
  });

  it('updates an existing item by id, leaving others untouched', () => {
    const harness = TestBed.inject(TestCollectionHarness);
    harness.collection.add({ id: '1', label: 'First' });
    harness.collection.add({ id: '2', label: 'Second' });
    harness.collection.update('1', { label: 'Updated' });
    expect(harness.collection.items()).toEqual([
      { id: '1', label: 'Updated' },
      { id: '2', label: 'Second' },
    ]);
  });

  it('removes an item by id', () => {
    const harness = TestBed.inject(TestCollectionHarness);
    harness.collection.add({ id: '1', label: 'First' });
    harness.collection.remove('1');
    expect(harness.collection.items()).toEqual([]);
  });
});
