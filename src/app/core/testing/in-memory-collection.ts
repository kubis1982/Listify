import { InjectionToken, Provider, signal } from '@angular/core';
import { FirestoreCollection } from '../storage/firestore-collection';

export function createInMemoryCollection<T extends { id: string }>(
  initial: readonly T[] = [],
): FirestoreCollection<T> {
  const items = signal<readonly T[]>(initial);
  return {
    items: items.asReadonly(),
    add: (item: T) => items.update((list) => [...list, item]),
    update: (id: string, changes: Partial<T>) =>
      items.update((list) => list.map((item) => (item.id === id ? { ...item, ...changes } : item))),
    remove: (id: string) => items.update((list) => list.filter((item) => item.id !== id)),
  };
}

/**
 * Overrides one specific collection token with an in-memory fake, for use
 * in a `TestBed.configureTestingModule({ providers: [...] })` call. Each
 * spec that depends on a service backed by `createFirestoreCollection`
 * should register a fake for exactly the token(s) it actually needs —
 * not a blanket bundle of every collection token in the app.
 */
export function provideFakeCollection<T extends { id: string }>(
  token: InjectionToken<FirestoreCollection<T>>,
  initial: readonly T[] = [],
): Provider {
  return { provide: token, useFactory: () => createInMemoryCollection<T>(initial) };
}
