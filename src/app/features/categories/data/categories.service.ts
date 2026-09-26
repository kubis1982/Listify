import { inject, InjectionToken, Service } from '@angular/core';
import { collection } from 'firebase/firestore';
import { createFirestoreCollection, FirestoreCollection } from '../../../core/storage/firestore-collection';
import { Category, CategoryId } from './category.model';

export const CATEGORIES_COLLECTION = new InjectionToken<FirestoreCollection<Category>>(
  'CATEGORIES_COLLECTION',
  {
    providedIn: 'root',
    factory: () =>
      createFirestoreCollection<Category>({
        query: (firestore, uid) => collection(firestore, `users/${uid}/categories`),
        docPath: (uid, id) => `users/${uid}/categories/${id}`,
      }),
  },
);

@Service()
export class CategoriesService {
  private readonly store = inject(CATEGORIES_COLLECTION);

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
