import { TestBed } from '@angular/core/testing';
import { createInMemoryCollection } from '../../../core/testing/in-memory-collection';
import { AuthService } from '../../../core/auth/auth.service';
import { createFakeAuthService } from '../../../testing/fake-auth-service';
import { Product } from '../../products/data/product.model';
import { ShoppingListsService, SHOPPING_LISTS_COLLECTION } from './shopping-lists.service';

describe('ShoppingListsService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: SHOPPING_LISTS_COLLECTION, useFactory: () => createInMemoryCollection() },
        { provide: AuthService, useValue: createFakeAuthService('owner-1') },
      ],
    });
  });

  it('starts with no lists', () => {
    expect(TestBed.inject(ShoppingListsService).lists()).toEqual([]);
  });

  it('addList creates an active list owned by the signed-in user', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.addList('Weekend shopping');

    expect(list.name).toBe('Weekend shopping');
    expect(list.status).toBe('active');
    expect(list.ownerId).toBe('owner-1');
    expect(list.memberIds).toEqual(['owner-1']);
    expect(list.items).toEqual([]);
  });

  it('importList creates a fresh list from export data', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.importList({
      name: 'Imported',
      items: [{ productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2 }],
    });

    expect(list.ownerId).toBe('owner-1');
    expect(list.memberIds).toEqual(['owner-1']);
    expect(list.items).toEqual([
      expect.objectContaining({ productName: 'Milk', quantity: 2, purchased: false }),
    ]);
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
