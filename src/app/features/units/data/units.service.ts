import { computed, Service } from '@angular/core';
import { createLocalStorageCollection } from '../../../core/storage/local-storage-collection';
import { Unit, UnitId } from './unit.model';

@Service()
export class UnitsService {
  private readonly store = createLocalStorageCollection<Unit>('listify:units');

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
