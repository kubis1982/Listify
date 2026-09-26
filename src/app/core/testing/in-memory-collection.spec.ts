import { InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FirestoreCollection } from '../storage/firestore-collection';
import { createInMemoryCollection, provideFakeCollection } from './in-memory-collection';

interface Widget {
  id: string;
  name: string;
}

const WIDGETS = new InjectionToken<FirestoreCollection<Widget>>('WIDGETS');

describe('createInMemoryCollection', () => {
  it('starts empty by default', () => {
    TestBed.runInInjectionContext(() => {
      const collection = createInMemoryCollection<Widget>();
      expect(collection.items()).toEqual([]);
    });
  });

  it('adds, updates, and removes items synchronously', () => {
    TestBed.runInInjectionContext(() => {
      const collection = createInMemoryCollection<Widget>();

      collection.add({ id: 'w1', name: 'Widget' });
      expect(collection.items()).toEqual([{ id: 'w1', name: 'Widget' }]);

      collection.update('w1', { name: 'Widget v2' });
      expect(collection.items()).toEqual([{ id: 'w1', name: 'Widget v2' }]);

      collection.remove('w1');
      expect(collection.items()).toEqual([]);
    });
  });

  it('accepts a seeded initial value', () => {
    TestBed.runInInjectionContext(() => {
      const collection = createInMemoryCollection<Widget>([{ id: 'seed', name: 'Seeded' }]);
      expect(collection.items()).toEqual([{ id: 'seed', name: 'Seeded' }]);
    });
  });
});

describe('provideFakeCollection', () => {
  it('registers an in-memory fake behind the given token', () => {
    TestBed.configureTestingModule({ providers: [provideFakeCollection(WIDGETS)] });
    const widgets = TestBed.inject(WIDGETS);

    expect(widgets.items()).toEqual([]);
    widgets.add({ id: 'w1', name: 'Widget' });
    expect(widgets.items()).toEqual([{ id: 'w1', name: 'Widget' }]);
  });

  it('accepts a seeded initial value', () => {
    TestBed.configureTestingModule({
      providers: [provideFakeCollection(WIDGETS, [{ id: 'seed', name: 'Seeded' }])],
    });
    expect(TestBed.inject(WIDGETS).items()).toEqual([{ id: 'seed', name: 'Seeded' }]);
  });
});
