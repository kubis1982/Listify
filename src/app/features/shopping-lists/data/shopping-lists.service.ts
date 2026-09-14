import { Service } from '@angular/core';
import { createLocalStorageCollection } from '../../../core/storage/local-storage-collection';
import { Category } from '../../categories/data/category.model';
import { Product } from '../../products/data/product.model';
import { Unit } from '../../units/data/unit.model';
import { type ShoppingListExport } from './shopping-list-export';
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

  importList(data: ShoppingListExport['list']): ShoppingList {
    const list: ShoppingList = {
      id: crypto.randomUUID(),
      name: data.name,
      createdAt: new Date().toISOString(),
      status: 'active',
      items: data.items.map(({ productName, unitLabel, categoryName, quantity, note }) => ({
        id: crypto.randomUUID(),
        productName,
        unitLabel,
        categoryName,
        quantity,
        purchased: false,
        note,
      })),
    };
    this.store.add(list);
    return list;
  }

  setStatus(id: ShoppingListId, status: ShoppingList['status']): void {
    this.store.update(id, { status });
  }

  rename(id: ShoppingListId, name: string): void {
    this.store.update(id, { name });
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
  ): boolean {
    const list = this.lists().find((l) => l.id === listId);
    if (!list || list.status !== 'active') {
      return false;
    }
    const existing = list.items.find((item) => this.isSameUnpurchasedItem(item, product, unit, note));
    if (existing) {
      this.store.update(listId, {
        items: list.items.map((item) =>
          item.id === existing.id ? { ...item, quantity: item.quantity + quantity } : item,
        ),
      });
      return true;
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
    return false;
  }

  private isSameUnpurchasedItem(
    item: ShoppingListItem,
    product: Product,
    unit: Unit,
    note?: string,
  ): boolean {
    return (
      !item.purchased &&
      item.productName.toLowerCase() === product.name.toLowerCase() &&
      item.unitLabel.toLowerCase() === unit.symbol.toLowerCase() &&
      (item.note ?? '').toLowerCase() === (note ?? '').toLowerCase()
    );
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

  updateItemQuantity(listId: ShoppingListId, itemId: ShoppingListItemId, quantity: number): void {
    const list = this.lists().find((l) => l.id === listId);
    if (!list || list.status !== 'active') {
      return;
    }
    this.store.update(listId, {
      items: list.items.map((item) => (item.id === itemId ? { ...item, quantity } : item)),
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
