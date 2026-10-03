import { Provider, signal } from '@angular/core';
import { ShoppingList, ShoppingListId } from '../features/shopping-lists/data/shopping-list.model';
import {
  SHOPPING_LISTS_STORE,
  ShoppingListsStore,
} from '../features/shopping-lists/data/shopping-lists.store';

export function createInMemoryShoppingListsStore(
  initial: readonly ShoppingList[] = [],
): ShoppingListsStore {
  const lists = signal<readonly ShoppingList[]>(initial);
  const updateOne = (id: ShoppingListId, change: (list: ShoppingList) => ShoppingList) =>
    lists.update((all) => all.map((list) => (list.id === id ? change(list) : list)));

  return {
    lists: lists.asReadonly(),
    addList: (list) => lists.update((all) => [...all, list]),
    updateList: (id, changes) => updateOne(id, (list) => ({ ...list, ...changes })),
    removeList: (id) => lists.update((all) => all.filter((list) => list.id !== id)),
    putItem: (listId, item) =>
      updateOne(listId, (list) => ({
        ...list,
        items: list.items.some((existing) => existing.id === item.id)
          ? list.items.map((existing) => (existing.id === item.id ? item : existing))
          : [...list.items, item],
      })),
    removeItem: (listId, itemId) =>
      updateOne(listId, (list) => ({ ...list, items: list.items.filter((item) => item.id !== itemId) })),
  };
}

export function provideFakeShoppingListsStore(initial: readonly ShoppingList[] = []): Provider {
  return { provide: SHOPPING_LISTS_STORE, useFactory: () => createInMemoryShoppingListsStore(initial) };
}

/** A list owned by the default fake-auth user ('test-uid'). */
export function buildShoppingList(overrides: Partial<ShoppingList> = {}): ShoppingList {
  return {
    id: 'list-1',
    name: 'Weekly groceries',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    items: [],
    ownerId: 'test-uid',
    memberIds: ['test-uid'],
    memberNames: { 'test-uid': 'Test User' },
    ...overrides,
  };
}
