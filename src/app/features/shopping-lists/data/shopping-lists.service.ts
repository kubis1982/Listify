import { inject, Service } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { Product } from '../../products/data/product.model';
import { type ShoppingListExport } from './shopping-list-export';
import { ShoppingList, ShoppingListId, ShoppingListItem, ShoppingListItemId } from './shopping-list.model';
import { SHOPPING_LISTS_STORE } from './shopping-lists.store';

@Service()
export class ShoppingListsService {
  private readonly store = inject(SHOPPING_LISTS_STORE);
  private readonly authService = inject(AuthService);

  readonly lists = this.store.lists;

  isOwner(list: ShoppingList): boolean {
    return list.ownerId === this.authService.uid();
  }

  addList(name: string): ShoppingList {
    const list: ShoppingList = { ...this.newList(name), items: [] };
    this.store.addList(list);
    return list;
  }

  importList(data: ShoppingListExport['list']): ShoppingList {
    const list: ShoppingList = {
      ...this.newList(data.name),
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
    this.store.addList(list);
    return list;
  }

  setStatus(id: ShoppingListId, status: ShoppingList['status']): void {
    this.store.updateList(id, { status });
  }

  rename(id: ShoppingListId, name: string): void {
    this.store.updateList(id, { name });
  }

  removeList(id: ShoppingListId): void {
    this.store.removeList(id);
  }

  addItemFromProduct(
    listId: ShoppingListId,
    product: Product,
    unitSymbol: string,
    quantity: number,
    note?: string,
  ): boolean {
    const list = this.activeList(listId);
    if (!list) {
      return false;
    }
    const existing = list.items.find((item) =>
      this.isSameUnpurchasedItem(item, product, unitSymbol, note),
    );
    if (existing) {
      this.store.putItem(listId, { ...existing, quantity: existing.quantity + quantity });
      return true;
    }
    this.store.putItem(listId, {
      id: crypto.randomUUID(),
      productName: product.name,
      unitLabel: unitSymbol,
      categoryName: product.categoryName,
      quantity,
      purchased: false,
      note,
    });
    return false;
  }

  setItemPurchased(listId: ShoppingListId, itemId: ShoppingListItemId, purchased: boolean): void {
    const item = this.activeItem(listId, itemId);
    if (item) {
      this.store.putItem(listId, { ...item, purchased });
    }
  }

  updateItem(
    listId: ShoppingListId,
    itemId: ShoppingListItemId,
    quantity: number,
    note?: string,
  ): void {
    const item = this.activeItem(listId, itemId);
    if (item) {
      this.store.putItem(listId, { ...item, quantity, note });
    }
  }

  removeItem(listId: ShoppingListId, itemId: ShoppingListItemId): void {
    if (this.activeList(listId)) {
      this.store.removeItem(listId, itemId);
    }
  }

  private newList(name: string): Omit<ShoppingList, 'items'> {
    const uid = this.authService.uid() ?? '';
    return {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      status: 'active',
      ownerId: uid,
      memberIds: [uid],
      memberNames: { [uid]: this.authService.displayName() },
    };
  }

  private activeList(listId: ShoppingListId): ShoppingList | undefined {
    const list = this.lists().find((l) => l.id === listId);
    return list?.status === 'active' ? list : undefined;
  }

  private activeItem(listId: ShoppingListId, itemId: ShoppingListItemId): ShoppingListItem | undefined {
    return this.activeList(listId)?.items.find((item) => item.id === itemId);
  }

  private isSameUnpurchasedItem(
    item: ShoppingListItem,
    product: Product,
    unitSymbol: string,
    note?: string,
  ): boolean {
    return (
      !item.purchased &&
      item.productName.toLowerCase() === product.name.toLowerCase() &&
      item.unitLabel.toLowerCase() === unitSymbol.toLowerCase() &&
      (item.note ?? '').toLowerCase() === (note ?? '').toLowerCase()
    );
  }
}
