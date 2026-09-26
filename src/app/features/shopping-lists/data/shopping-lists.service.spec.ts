import { TestBed } from '@angular/core/testing';
import { createInMemoryCollection } from '../../../core/testing/in-memory-collection';
import { Product } from '../../products/data/product.model';
import { ShoppingListsService, SHOPPING_LISTS_COLLECTION } from './shopping-lists.service';

describe('ShoppingListsService', () => {
  const product: Product = { id: 'p1', name: 'Milk 3.2%', unitSymbol: 'l', categoryName: 'Dairy' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: SHOPPING_LISTS_COLLECTION, useFactory: () => createInMemoryCollection() }],
    });
  });

  it('starts with no lists', () => {
    expect(TestBed.inject(ShoppingListsService).lists()).toEqual([]);
  });

  it('addList creates an active list', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.addList('Weekend shopping');

    expect(list.name).toBe('Weekend shopping');
    expect(list.status).toBe('active');
    expect(list.items).toEqual([]);
  });

  it('importList creates a fresh list from export data', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.importList({
      name: 'Imported',
      items: [{ productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2 }],
    });

    expect(list.items).toEqual([
      expect.objectContaining({ productName: 'Milk', quantity: 2, purchased: false }),
    ]);
  });

  it('imports items without a note as items with no note', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.importList({
      name: 'Imported',
      items: [{ productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2 }],
    });

    expect(list.items[0].note).toBeUndefined();
  });

  it('does not persist unexpected extra fields on an imported item', () => {
    const service = TestBed.inject(ShoppingListsService);
    const itemWithExtraField = {
      productName: 'Milk',
      unitLabel: 'l',
      categoryName: 'Dairy',
      quantity: 2,
      note: 'organic',
      maliciousField: 'should not survive import',
    } as unknown as { productName: string; unitLabel: string; categoryName: string; quantity: number; note?: string };

    const list = service.importList({
      name: 'Imported',
      items: [itemWithExtraField],
    });

    expect(Object.keys(list.items[0]).sort()).toEqual(
      ['id', 'productName', 'unitLabel', 'categoryName', 'quantity', 'purchased', 'note'].sort(),
    );
    expect(list.items[0]).not.toHaveProperty('maliciousField');
  });

  it('addItemFromProduct adds a new item to an active list', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.addList('Weekend shopping');
    const product: Product = { id: 'p1', name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' };

    service.addItemFromProduct(list.id, product, 'l', 2);

    const updated = service.lists().find((l) => l.id === list.id)!;
    expect(updated.items).toEqual([
      expect.objectContaining({ productName: 'Milk', quantity: 2, purchased: false }),
    ]);
  });

  it('merges quantity case-insensitively across product name, unit, and note', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.addList('Weekend shopping');
    service.addItemFromProduct(list.id, product, 'l', 2, 'Organic');

    const upperProduct: Product = { ...product, name: 'MILK 3.2%' };
    const merged = service.addItemFromProduct(list.id, upperProduct, 'L', 1, 'organic');

    expect(merged).toBe(true);
    const items = service.lists().find((l) => l.id === list.id)!.items;
    expect(items.length).toBe(1);
    expect(items[0].quantity).toBe(3);
  });

  it('does not merge when the note differs', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.addList('Weekend shopping');
    service.addItemFromProduct(list.id, product, 'l', 2, 'organic');

    const merged = service.addItemFromProduct(list.id, product, 'l', 1, 'skimmed');

    expect(merged).toBe(false);
    expect(service.lists().find((l) => l.id === list.id)!.items.length).toBe(2);
  });

  it('does not merge into an item already marked as purchased', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.addList('Weekend shopping');
    service.addItemFromProduct(list.id, product, 'l', 2, 'organic');
    const itemId = service.lists().find((l) => l.id === list.id)!.items[0].id;
    service.setItemPurchased(list.id, itemId, true);

    const merged = service.addItemFromProduct(list.id, product, 'l', 1, 'organic');

    expect(merged).toBe(false);
    const items = service.lists().find((l) => l.id === list.id)!.items;
    expect(items.length).toBe(2);
    expect(items[0].quantity).toBe(2);
  });

  it('ignores item changes for a completed list', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.addList('Weekend shopping');
    service.addItemFromProduct(list.id, product, 'l', 1);
    const itemId = service.lists().find((l) => l.id === list.id)!.items[0].id;
    service.setStatus(list.id, 'completed');

    const added = service.addItemFromProduct(list.id, product, 'l', 2);
    service.setItemPurchased(list.id, itemId, true);
    service.updateItem(list.id, itemId, 9);
    service.removeItem(list.id, itemId);

    expect(added).toBe(false);
    const items = service.lists().find((l) => l.id === list.id)!.items;
    expect(items.length).toBe(1);
    expect(items[0].purchased).toBe(false);
    expect(items[0].quantity).toBe(1);
  });

  it('setStatus toggles between active and completed', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.addList('Weekend shopping');

    service.setStatus(list.id, 'completed');

    expect(service.lists().find((l) => l.id === list.id)?.status).toBe('completed');
  });

  it('removeList removes the list', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.addList('Weekend shopping');

    service.removeList(list.id);

    expect(service.lists()).toEqual([]);
  });
});
