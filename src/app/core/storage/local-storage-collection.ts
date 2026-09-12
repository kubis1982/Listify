import { effect, signal, Signal } from '@angular/core';

export interface LocalStorageCollection<T> {
  readonly items: Signal<readonly T[]>;
  add(item: T): void;
  update(id: string, changes: Partial<T>): void;
  remove(id: string): void;
}

function readFromStorage<T>(storageKey: string): T[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeToStorage<T>(storageKey: string, items: readonly T[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch {
    // localStorage unavailable or full — state stays in-memory for this session only.
  }
}

/**
 * Creates a signal-backed collection of items of type `T`, persisted to `localStorage`
 * under `storageKey`. Must be called as a field initializer of an injectable class,
 * since it uses `effect()` internally and therefore needs an injection context.
 */
export function createLocalStorageCollection<T extends { id: string }>(
  storageKey: string,
): LocalStorageCollection<T> {
  const items = signal<T[]>(readFromStorage<T>(storageKey));

  effect(() => writeToStorage(storageKey, items()));

  return {
    items: items.asReadonly(),
    add: (item: T) => items.update((list) => [...list, item]),
    update: (id: string, changes: Partial<T>) =>
      items.update((list) => list.map((item) => (item.id === id ? { ...item, ...changes } : item))),
    remove: (id: string) => items.update((list) => list.filter((item) => item.id !== id)),
  };
}
