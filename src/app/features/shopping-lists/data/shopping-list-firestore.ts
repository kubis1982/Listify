import type { DocumentData } from 'firebase/firestore';
import { ShoppingList, ShoppingListItem } from './shopping-list.model';

/**
 * Items are stored as a map keyed by item id (not an array) so that each
 * item edit is its own field-path write; concurrent edits of different
 * items by different members then never overwrite each other.
 */
export function shoppingListToFirestore(list: ShoppingList): DocumentData {
  return {
    ...list,
    items: Object.fromEntries(list.items.map((item) => [item.id, item])),
  };
}

export function shoppingListFromFirestore(data: DocumentData, id: string): ShoppingList {
  const items = (data['items'] ?? {}) as Record<string, unknown>;
  return {
    id,
    name: data['name'],
    createdAt: data['createdAt'],
    status: data['status'],
    ownerId: data['ownerId'],
    memberIds: data['memberIds'] ?? [],
    memberNames: data['memberNames'] ?? {},
    items: Object.entries(items)
      .filter(([, item]) => isValidItem(item))
      .map(([itemId, item]) => ({ ...(item as ShoppingListItem), id: itemId })),
  };
}

/** Other accounts write this document too, so stored items are validated defensively. */
function isValidItem(item: unknown): item is Omit<ShoppingListItem, 'id'> {
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate['productName'] === 'string' &&
    typeof candidate['unitLabel'] === 'string' &&
    typeof candidate['categoryName'] === 'string' &&
    typeof candidate['quantity'] === 'number' &&
    Number.isFinite(candidate['quantity']) &&
    typeof candidate['purchased'] === 'boolean' &&
    (candidate['note'] === undefined || typeof candidate['note'] === 'string')
  );
}
