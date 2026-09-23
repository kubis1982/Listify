import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createLocalStorageCollection } from './local-storage-collection';

interface TestItem {
  id: string;
  label: string;
}

@Injectable()
class TestCollectionHarness {
  readonly collection = createLocalStorageCollection<TestItem>('test:items');
}

interface LegacyTestItem {
  id: string;
  oldLabel: string;
}

let lastMigrateRawInput: unknown[] | undefined;

@Injectable()
class TestCollectionWithMigrationHarness {
  readonly collection = createLocalStorageCollection<TestItem>('test:migrated-items', {
    migrate: (raw) => {
      lastMigrateRawInput = raw;
      return (raw as LegacyTestItem[]).map((item) => ({ id: item.id, label: item.oldLabel }));
    },
  });
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

  it('starts empty when localStorage contains valid JSON that is not an array', () => {
    localStorage.setItem('test:items', JSON.stringify({ not: 'an array' }));
    const harness = TestBed.inject(TestCollectionHarness);
    expect(harness.collection.items()).toEqual([]);
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
    expect(JSON.parse(localStorage.getItem('test:items')!)).toEqual([{ id: '1', label: 'First' }]);
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

describe('createLocalStorageCollection migration', () => {
  beforeEach(() => {
    localStorage.clear();
    lastMigrateRawInput = undefined;
    TestBed.configureTestingModule({ providers: [TestCollectionWithMigrationHarness] });
  });

  it('applies the migrate function to raw items read from storage', () => {
    localStorage.setItem('test:migrated-items', JSON.stringify([{ id: '1', oldLabel: 'Legacy' }]));
    const harness = TestBed.inject(TestCollectionWithMigrationHarness);
    expect(harness.collection.items()).toEqual([{ id: '1', label: 'Legacy' }]);
  });

  it('persists the migrated shape back to storage', () => {
    localStorage.setItem('test:migrated-items', JSON.stringify([{ id: '1', oldLabel: 'Legacy' }]));
    TestBed.inject(TestCollectionWithMigrationHarness);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('test:migrated-items')!)).toEqual([
      { id: '1', label: 'Legacy' },
    ]);
  });

  it('calls migrate with an empty array when storage has no entry for the key', () => {
    TestBed.inject(TestCollectionWithMigrationHarness);
    expect(lastMigrateRawInput).toEqual([]);
  });
});
