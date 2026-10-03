import { computed, inject, InjectionToken, Service } from '@angular/core';
import { collection } from 'firebase/firestore';
import { createFirestoreCollection, FirestoreCollection } from '../../../core/storage/firestore-collection';
import { Unit, UnitId } from './unit.model';

export const UNITS_COLLECTION = new InjectionToken<FirestoreCollection<Unit>>('UNITS_COLLECTION', {
  providedIn: 'root',
  factory: () =>
    createFirestoreCollection<Unit>({
      query: (firestore, uid) => collection(firestore, `users/${uid}/units`),
      docPath: (uid, id) => `users/${uid}/units/${id}`,
    }),
});

@Service()
export class UnitsService {
  private readonly store = inject(UNITS_COLLECTION);

  readonly units = this.store.items;
  readonly defaultUnit = computed(() => this.units().find((unit) => unit.isDefault));

  add(unit: Omit<Unit, 'id'>): void {
    if (unit.isDefault) {
      this.clearDefault();
    }
    this.store.add({ ...unit, symbol: unit.symbol.toLowerCase(), id: crypto.randomUUID() });
  }

  update(id: UnitId, changes: Partial<Omit<Unit, 'id'>>): void {
    if (changes.isDefault) {
      this.clearDefault(id);
    }
    this.store.update(id, {
      ...changes,
      ...(changes.symbol !== undefined ? { symbol: changes.symbol.toLowerCase() } : {}),
    });
  }

  remove(id: UnitId): void {
    this.store.remove(id);
  }

  private clearDefault(excludeId?: UnitId): void {
    for (const unit of this.units()) {
      if (unit.isDefault && unit.id !== excludeId) {
        this.store.update(unit.id, { isDefault: false });
      }
    }
  }
}
