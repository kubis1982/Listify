import { TestBed } from '@angular/core/testing';
import { CategoriesService } from '../../categories/data/categories.service';
import { UnitsService } from '../../units/data/units.service';
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
    service.add({ name: 'Milk 3.2%', unitSymbol: 'l', categoryName: 'Dairy' });
    expect(service.products()).toEqual([
      expect.objectContaining({ name: 'Milk 3.2%', unitSymbol: 'l', categoryName: 'Dairy' }),
    ]);
    expect(service.products()[0].id).toBeTruthy();
  });

  it('returns the created product, including its generated id', () => {
    const service = TestBed.inject(ProductsService);
    const created = service.add({ name: 'Milk 3.2%', unitSymbol: 'l', categoryName: 'Dairy' });
    expect(created).toEqual(service.products()[0]);
    expect(created.id).toBeTruthy();
  });

  it('updates an existing product', () => {
    const service = TestBed.inject(ProductsService);
    service.add({ name: 'Milk 3.2%', unitSymbol: 'l', categoryName: 'Dairy' });
    const id = service.products()[0].id;
    service.update(id, { name: 'Milk 1.5%' });
    expect(service.products()[0].name).toBe('Milk 1.5%');
  });

  it('removes a product', () => {
    const service = TestBed.inject(ProductsService);
    service.add({ name: 'Milk 3.2%', unitSymbol: 'l', categoryName: 'Dairy' });
    const id = service.products()[0].id;
    service.remove(id);
    expect(service.products()).toEqual([]);
  });

  it('migrates a legacy product record on load, resolving ids to the current unit/category text', () => {
    const unitsService = TestBed.inject(UnitsService);
    unitsService.add({ symbol: 'kg' });
    const categoriesService = TestBed.inject(CategoriesService);
    categoriesService.add({ name: 'Dairy' });
    const unitId = unitsService.units()[0].id;
    const categoryId = categoriesService.categories()[0].id;

    localStorage.setItem(
      'listify:products',
      JSON.stringify([{ id: 'p1', name: 'Milk', defaultUnitId: unitId, categoryId }]),
    );

    const service = TestBed.inject(ProductsService);
    expect(service.products()).toEqual([
      { id: 'p1', name: 'Milk', unitSymbol: 'kg', categoryName: 'Dairy' },
    ]);
  });

  it('migrates a legacy product whose referenced unit/category no longer exists to empty strings', () => {
    localStorage.setItem(
      'listify:products',
      JSON.stringify([
        { id: 'p1', name: 'Milk', defaultUnitId: 'missing-unit', categoryId: 'missing-category' },
      ]),
    );

    const service = TestBed.inject(ProductsService);
    expect(service.products()).toEqual([{ id: 'p1', name: 'Milk', unitSymbol: '', categoryName: '' }]);
  });

  it('leaves an already-migrated product unchanged', () => {
    localStorage.setItem(
      'listify:products',
      JSON.stringify([{ id: 'p1', name: 'Milk', unitSymbol: 'kg', categoryName: 'Dairy' }]),
    );

    const service = TestBed.inject(ProductsService);
    expect(service.products()).toEqual([
      { id: 'p1', name: 'Milk', unitSymbol: 'kg', categoryName: 'Dairy' },
    ]);
  });
});
