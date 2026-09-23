import { inject, Service } from '@angular/core';
import { createLocalStorageCollection } from '../../../core/storage/local-storage-collection';
import { CategoriesService } from '../../categories/data/categories.service';
import { UnitsService } from '../../units/data/units.service';
import { Product, ProductId } from './product.model';

interface LegacyProductV1 {
  id: string;
  name: string;
  defaultUnitId?: string;
  categoryId?: string;
  unitSymbol?: string;
  categoryName?: string;
}

@Service()
export class ProductsService {
  private readonly unitsService = inject(UnitsService);
  private readonly categoriesService = inject(CategoriesService);

  private readonly store = createLocalStorageCollection<Product>('listify:products', {
    migrate: (raw) => (raw as LegacyProductV1[]).map((item) => this.migrateProduct(item)),
  });

  readonly products = this.store.items;

  add(product: Omit<Product, 'id'>): Product {
    const created: Product = { ...product, id: crypto.randomUUID() };
    this.store.add(created);
    return created;
  }

  update(id: ProductId, changes: Partial<Omit<Product, 'id'>>): void {
    this.store.update(id, changes);
  }

  remove(id: ProductId): void {
    this.store.remove(id);
  }

  private migrateProduct(item: LegacyProductV1): Product {
    if (item.unitSymbol !== undefined && item.categoryName !== undefined) {
      return { id: item.id, name: item.name, unitSymbol: item.unitSymbol, categoryName: item.categoryName };
    }
    return {
      id: item.id,
      name: item.name,
      unitSymbol:
        item.unitSymbol ??
        this.unitsService.units().find((unit) => unit.id === item.defaultUnitId)?.symbol ??
        '',
      categoryName:
        item.categoryName ??
        this.categoriesService.categories().find((category) => category.id === item.categoryId)?.name ??
        '',
    };
  }
}
