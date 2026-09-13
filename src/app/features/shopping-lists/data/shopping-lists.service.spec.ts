import { TestBed } from '@angular/core/testing';
import { Category } from '../../categories/data/category.model';
import { Product } from '../../products/data/product.model';
import { Unit } from '../../units/data/unit.model';
import { ShoppingListsService } from './shopping-lists.service';

describe('ShoppingListsService', () => {
  const product: Product = { id: 'p1', name: 'Milk 3.2%', defaultUnitId: 'u1', categoryId: 'c1' };
  const unit: Unit = { id: 'u1', name: 'litre', symbol: 'l' };
  const category: Category = { id: 'c1', name: 'Dairy' };

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

  it('adds an item to a list as a snapshot of the given product, unit, and category', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;

    service.addItemFromProduct(listId, product, unit, category, 2, 'organic');

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
    service.addItemFromProduct(listId, product, unit, category, 1);
    const itemId = service.lists()[0].items[0].id;

    service.setItemPurchased(listId, itemId, true);

    expect(service.lists()[0].items[0].purchased).toBe(true);
  });

  it('removes an item from a list', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, unit, category, 1);
    const itemId = service.lists()[0].items[0].id;

    service.removeItem(listId, itemId);

    expect(service.lists()[0].items).toEqual([]);
  });

  it('merges quantity into an existing unpurchased item with the same product, unit, and note', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, unit, category, 2, 'organic');

    const merged = service.addItemFromProduct(listId, product, unit, category, 3, 'organic');

    expect(merged).toBe(true);
    const list = service.lists()[0];
    expect(list.items.length).toBe(1);
    expect(list.items[0].quantity).toBe(5);
  });

  it('merges quantity case-insensitively across product name, unit, and note', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, unit, category, 2, 'Organic');

    const upperProduct: Product = { ...product, name: 'MILK 3.2%' };
    const upperUnit: Unit = { ...unit, symbol: 'L' };
    const merged = service.addItemFromProduct(listId, upperProduct, upperUnit, category, 1, 'organic');

    expect(merged).toBe(true);
    const list = service.lists()[0];
    expect(list.items.length).toBe(1);
    expect(list.items[0].quantity).toBe(3);
  });

  it('does not merge when the note differs', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, unit, category, 2, 'organic');

    const merged = service.addItemFromProduct(listId, product, unit, category, 1, 'skimmed');

    expect(merged).toBe(false);
    expect(service.lists()[0].items.length).toBe(2);
  });

  it('does not merge into an item already marked as purchased', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, unit, category, 2, 'organic');
    const itemId = service.lists()[0].items[0].id;
    service.setItemPurchased(listId, itemId, true);

    const merged = service.addItemFromProduct(listId, product, unit, category, 1, 'organic');

    expect(merged).toBe(false);
    const list = service.lists()[0];
    expect(list.items.length).toBe(2);
    expect(list.items[0].quantity).toBe(2);
  });

  it('ignores item changes for a completed list', () => {
    const service = TestBed.inject(ShoppingListsService);
    service.addList('Weekly groceries');
    const listId = service.lists()[0].id;
    service.addItemFromProduct(listId, product, unit, category, 1);
    const itemId = service.lists()[0].items[0].id;
    service.setStatus(listId, 'completed');

    service.addItemFromProduct(listId, product, unit, category, 2);
    service.setItemPurchased(listId, itemId, true);
    service.removeItem(listId, itemId);

    const list = service.lists()[0];
    expect(list.items.length).toBe(1);
    expect(list.items[0].purchased).toBe(false);
  });
});
