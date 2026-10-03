import { InjectionToken, Signal } from '@angular/core';
import { collection, deleteField, query, where } from 'firebase/firestore';
import { createFirestoreCollection } from '../../../core/storage/firestore-collection';
import { shoppingListFromFirestore, shoppingListToFirestore } from './shopping-list-firestore';
import { ShoppingList, ShoppingListId, ShoppingListItem, ShoppingListItemId } from './shopping-list.model';

export interface ShoppingListsStore {
  readonly lists: Signal<readonly ShoppingList[]>;
  addList(list: ShoppingList): void;
  updateList(id: ShoppingListId, changes: Partial<Pick<ShoppingList, 'name' | 'status'>>): void;
  removeList(id: ShoppingListId): void;
  /** Adds the item, or replaces the item with the same id, without touching other items. */
  putItem(listId: ShoppingListId, item: ShoppingListItem): void;
  removeItem(listId: ShoppingListId, itemId: ShoppingListItemId): void;
}

export function createFirestoreShoppingListsStore(): ShoppingListsStore {
  const documents = createFirestoreCollection<ShoppingList>({
    query: (firestore, uid) =>
      query(collection(firestore, 'shoppingLists'), where('memberIds', 'array-contains', uid)),
    docPath: (_uid, id) => `shoppingLists/${id}`,
    fromFirestore: shoppingListFromFirestore,
    toFirestore: shoppingListToFirestore,
  });
  return {
    lists: documents.items,
    addList: (list) => documents.add(list),
    updateList: (id, changes) => documents.update(id, changes),
    removeList: (id) => documents.remove(id),
    // Whole-item writes: if someone deleted the item meanwhile, it comes back
    // complete rather than as a partial `{ purchased: true }` fragment.
    putItem: (listId, item) => documents.updateFields(listId, { [`items.${item.id}`]: item }),
    removeItem: (listId, itemId) =>
      documents.updateFields(listId, { [`items.${itemId}`]: deleteField() }),
  };
}

export const SHOPPING_LISTS_STORE = new InjectionToken<ShoppingListsStore>('SHOPPING_LISTS_STORE', {
  providedIn: 'root',
  factory: createFirestoreShoppingListsStore,
});
