import { TestBed } from '@angular/core/testing';
import { Product } from '../../products/data/product.model';
import { ShoppingListsService } from './shopping-lists.service';

describe('ShoppingListsService', () => {
  const product: Product = { id: 'p1', name: 'Milk 3.2%', unitSymbol: 'l', categoryName: 'Dairy' };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('starts with no lists', () => {
    const service = TestBed.inject(ShoppingListsService);
    expect(service.lists()).toEqual([]);
  });

  it('creates a list with active status, a timestamp, and no items', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const [list] = service.lists();
    expect(list.name).toBe('Weekly groceries');
    expect(list.status).toBe('active');
    expect(list.items).toEqual([]);
    expect(Number.isNaN(Date.parse(list.createdAt))).toBe(false);
  });

  it('returns the created list from addList', () => {
    const service = TestBed.inject(ShoppingListsService);
    const created = service.addList('Weekly groceries');
    expect(created).toEqual(service.lists()[0]);
  });

  it('changes the status of a list', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const id = service.lists()[0].id;
    service.setStatus(id, 'completed');
    expect(service.lists()[0].status).toBe('completed');
  });

  it('removes a list', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const id = service.lists()[0].id;
    service.removeList(id);
    expect(service.lists()).toEqual([]);
  });

  it('adds an item to a list as a snapshot of the given product and unit', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;

    service.addItemFromProduct(listId, product, 'l', 2, 'organic');

    const [item] = service.lists()[0].items;
    expect(item).toEqual(
      expect.objectContaining({
        productName: 'Milk 3.2%',
        unitLabel: 'l',
        categoryName: 'Dairy',
        quantity: 2,
        purchased: false,
        note: 'organic',
      }),
    );
    expect(item.id).toBeTruthy();
  });

  it('marks an item as purchased', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, 'l', 1);
    const itemId = service.lists()[0].items[0].id;

    service.setItemPurchased(listId, itemId, true);

    expect(service.lists()[0].items[0].purchased).toBe(true);
  });

  it('updates the quantity of an item', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, 'l', 1);
    const itemId = service.lists()[0].items[0].id;

    service.updateItemQuantity(listId, itemId, 3.5);

    expect(service.lists()[0].items[0].quantity).toBe(3.5);
  });

  it('removes an item from a list', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, 'l', 1);
    const itemId = service.lists()[0].items[0].id;

    service.removeItem(listId, itemId);

    expect(service.lists()[0].items).toEqual([]);
  });

  it('merges quantity into an existing unpurchased item with the same product, unit, and note', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, 'l', 2, 'organic');

    const merged = service.addItemFromProduct(listId, product, 'l', 3, 'organic');

    expect(merged).toBe(true);
    const list = service.lists()[0];
    expect(list.items.length).toBe(1);
    expect(list.items[0].quantity).toBe(5);
  });

  it('merges quantity case-insensitively across product name, unit, and note', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, 'l', 2, 'Organic');

    const upperProduct: Product = { ...product, name: 'MILK 3.2%' };
    const merged = service.addItemFromProduct(listId, upperProduct, 'L', 1, 'organic');

    expect(merged).toBe(true);
    const list = service.lists()[0];
    expect(list.items.length).toBe(1);
    expect(list.items[0].quantity).toBe(3);
  });

  it('does not merge when the note differs', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, 'l', 2, 'organic');

    const merged = service.addItemFromProduct(listId, product, 'l', 1, 'skimmed');

    expect(merged).toBe(false);
    expect(service.lists()[0].items.length).toBe(2);
  });

  it('does not merge into an item already marked as purchased', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, 'l', 2, 'organic');
    const itemId = service.lists()[0].items[0].id;
    service.setItemPurchased(listId, itemId, true);

    const merged = service.addItemFromProduct(listId, product, 'l', 1, 'organic');

    expect(merged).toBe(false);
    const list = service.lists()[0];
    expect(list.items.length).toBe(2);
    expect(list.items[0].quantity).toBe(2);
  });

  it('ignores item changes for a completed list', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, 'l', 1);
    const itemId = service.lists()[0].items[0].id;
    service.setStatus(listId, 'completed');

    service.addItemFromProduct(listId, product, 'l', 2);
    service.setItemPurchased(listId, itemId, true);
    service.updateItemQuantity(listId, itemId, 9);
    service.removeItem(listId, itemId);

    const list = service.lists()[0];
    expect(list.items.length).toBe(1);
    expect(list.items[0].purchased).toBe(false);
    expect(list.items[0].quantity).toBe(1);
  });

  it('imports a list with a fresh id, active status, and unpurchased items', () => {
    const service = TestBed.inject(ShoppingListsService);

    const created = service.importList({
      name: 'Shared list',
      items: [{ productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2, note: 'organic' }],
    });

    expect(created.status).toBe('active');
    expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
    expect(created.id).toBeTruthy();
    expect(created.items.length).toBe(1);
    expect(created.items[0]).toEqual(
      expect.objectContaining({
        productName: 'Milk',
        unitLabel: 'l',
        categoryName: 'Dairy',
        quantity: 2,
        purchased: false,
        note: 'organic',
      }),
    );
    expect(created.items[0].id).toBeTruthy();
    expect(service.lists()).toEqual([created]);
  });

  it('imports items without a note as items with no note', () => {
    const service = TestBed.inject(ShoppingListsService);

    const created = service.importList({
      name: 'Shared list',
      items: [{ productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2 }],
    });

    expect(created.items[0].note).toBeUndefined();
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

    const created = service.importList({
      name: 'Shared list',
      items: [itemWithExtraField],
    });

    expect(Object.keys(created.items[0]).sort()).toEqual(
      ['id', 'productName', 'unitLabel', 'categoryName', 'quantity', 'purchased', 'note'].sort(),
    );
    expect(created.items[0]).not.toHaveProperty('maliciousField');
  });
});
