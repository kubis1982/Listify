import { Service } from '@angular/core';
import { createLocalStorageCollection } from '../../../core/storage/local-storage-collection';
import { Unit, UnitId } from './unit.model';

@Service()
export class UnitsService {
  private readonly store = createLocalStorageCollection<Unit>('listify:units');

  readonly units = this.store.items;

  add(unit: Omit<Unit, 'id'>): void {
    this.store.add({ ...unit, id: crypto.randomUUID() });
  }

  update(id: UnitId, changes: Partial<Omit<Unit, 'id'>>): void {
    this.store.update(id, changes);
  }

  remove(id: UnitId): void {
    this.store.remove(id);
  }
}
