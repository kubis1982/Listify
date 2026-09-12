import { Service } from '@angular/core';
import { createLocalStorageCollection } from '../../../core/storage/local-storage-collection';
import { Category, CategoryId } from './category.model';

@Service()
export class CategoriesService {
  private readonly store = createLocalStorageCollection<Category>('listify:categories');

  readonly categories = this.store.items;

  add(category: Omit<Category, 'id'>): void {
    this.store.add({ ...category, id: crypto.randomUUID() });
  }

  update(id: CategoryId, changes: Partial<Omit<Category, 'id'>>): void {
    this.store.update(id, changes);
  }

  remove(id: CategoryId): void {
    this.store.remove(id);
  }
}
