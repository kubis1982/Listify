import { inject, InjectionToken, Service } from '@angular/core';
import { collection } from 'firebase/firestore';
import { createFirestoreCollection, FirestoreCollection } from '../../../core/storage/firestore-collection';
import { Product, ProductId } from './product.model';

export const PRODUCTS_COLLECTION = new InjectionToken<FirestoreCollection<Product>>('PRODUCTS_COLLECTION', {
  providedIn: 'root',
  factory: () =>
    createFirestoreCollection<Product>({
      query: (firestore, uid) => collection(firestore, `users/${uid}/products`),
      docPath: (uid, id) => `users/${uid}/products/${id}`,
    }),
});

@Service()
export class ProductsService {
  private readonly store = inject(PRODUCTS_COLLECTION);

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
}
