import { TestBed } from '@angular/core/testing';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('starts with no products', () => {
    const service = TestBed.inject(ProductsService);
    expect(service.products()).toEqual([]);
  });

  it('adds a product with a generated id', () => {
    const service = TestBed.inject(ProductsService);
    service.add({ name: 'Milk 3.2%', defaultUnitId: 'unit-1', categoryId: 'category-1' });
    expect(service.products()).toEqual([
      expect.objectContaining({
        name: 'Milk 3.2%',
        defaultUnitId: 'unit-1',
        categoryId: 'category-1',
      }),
    ]);
    expect(service.products()[0].id).toBeTruthy();
  });

  it('returns the created product, including its generated id', () => {
    const service = TestBed.inject(ProductsService);
    const created = service.add({ name: 'Milk 3.2%', defaultUnitId: 'unit-1', categoryId: 'category-1' });
    expect(created).toEqual(service.products()[0]);
    expect(created.id).toBeTruthy();
  });

  it('updates an existing product', () => {
    const service = TestBed.inject(ProductsService);
    service.add({ name: 'Milk 3.2%', defaultUnitId: 'unit-1', categoryId: 'category-1' });
    const id = service.products()[0].id;
    service.update(id, { name: 'Milk 1.5%' });
    expect(service.products()[0].name).toBe('Milk 1.5%');
  });

  it('removes a product', () => {
    const service = TestBed.inject(ProductsService);
    service.add({ name: 'Milk 3.2%', defaultUnitId: 'unit-1', categoryId: 'category-1' });
    const id = service.products()[0].id;
    service.remove(id);
    expect(service.products()).toEqual([]);
  });
});
