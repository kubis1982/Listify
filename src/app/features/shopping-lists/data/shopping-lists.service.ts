import { Service } from '@angular/core';
import { createLocalStorageCollection } from '../../../core/storage/local-storage-collection';
import { Category } from '../../categories/data/category.model';
import { Product } from '../../products/data/product.model';
import { Unit } from '../../units/data/unit.model';
import {
  ShoppingList,
  ShoppingListId,
  ShoppingListItem,
  ShoppingListItemId,
} from './shopping-list.model';

@Service()
export class ShoppingListsService {
  private readonly store = createLocalStorageCollection<ShoppingList>('listify:shopping-lists');

  readonly lists = this.store.items;

  addList(name: string): ShoppingList {
    const list: ShoppingList = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      status: 'active',
      items: [],
    };
    this.store.add(list);
    return list;
  }

  setStatus(id: ShoppingListId, status: ShoppingList['status']): void {
    this.store.update(id, { status });
  }

  removeList(id: ShoppingListId): void {
    this.store.remove(id);
  }

  addItemFromProduct(
    listId: ShoppingListId,
    product: Product,
    unit: Unit,
    category: Category,
    quantity: number,
    note?: string,
  ): void {
    const list = this.lists().find((l) => l.id === listId);
    if (!list || list.status !== 'active') {
      return;
    }
    const item: ShoppingListItem = {
      id: crypto.randomUUID(),
      productName: product.name,
      unitLabel: unit.symbol,
      categoryName: category.name,
      quantity,
      purchased: false,
      note,
    };
    this.store.update(listId, { items: [...list.items, item] });
  }

  setItemPurchased(listId: ShoppingListId, itemId: ShoppingListItemId, purchased: boolean): void {
    const list = this.lists().find((l) => l.id === listId);
    if (!list || list.status !== 'active') {
      return;
    }
    this.store.update(listId, {
      items: list.items.map((item) => (item.id === itemId ? { ...item, purchased } : item)),
    });
  }

  removeItem(listId: ShoppingListId, itemId: ShoppingListItemId): void {
    const list = this.lists().find((l) => l.id === listId);
    if (!list || list.status !== 'active') {
      return;
    }
    this.store.update(listId, { items: list.items.filter((item) => item.id !== itemId) });
  }
}
