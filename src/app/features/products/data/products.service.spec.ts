import { TestBed } from '@angular/core/testing';
import { createInMemoryCollection } from '../../../core/testing/in-memory-collection';
import { ProductsService, PRODUCTS_COLLECTION } from './products.service';

describe('ProductsService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: PRODUCTS_COLLECTION, useFactory: () => createInMemoryCollection() }],
    });
  });

  it('starts with no products', () => {
    expect(TestBed.inject(ProductsService).products()).toEqual([]);
  });

  it('adds a product with a generated id and returns it', () => {
    const service = TestBed.inject(ProductsService);
    const created = service.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    expect(created).toEqual(expect.objectContaining({ name: 'Milk' }));
    expect(service.products()).toEqual([created]);
  });

  it('updates an existing product', () => {
    const service = TestBed.inject(ProductsService);
    const created = service.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    service.update(created.id, { name: 'Whole Milk' });
    expect(service.products()[0].name).toBe('Whole Milk');
  });

  it('removes a product', () => {
    const service = TestBed.inject(ProductsService);
    const created = service.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    service.remove(created.id);
    expect(service.products()).toEqual([]);
  });
});
