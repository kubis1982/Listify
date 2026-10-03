import { TestBed } from '@angular/core/testing';
import { createInMemoryCollection } from '../../../core/testing/in-memory-collection';
import { UnitsService, UNITS_COLLECTION } from './units.service';

describe('UnitsService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: UNITS_COLLECTION, useFactory: () => createInMemoryCollection() }],
    });
  });

  it('starts with no units', () => {
    expect(TestBed.inject(UnitsService).units()).toEqual([]);
  });

  it('adds a unit, lower-casing its symbol', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ symbol: 'KG' });
    expect(service.units()).toEqual([expect.objectContaining({ symbol: 'kg' })]);
  });

  it('marking a unit default clears the previous default', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ symbol: 'kg', isDefault: true });
    service.add({ symbol: 'l', isDefault: true });
    expect(service.units().find((u) => u.symbol === 'kg')?.isDefault).toBe(false);
    expect(service.defaultUnit()?.symbol).toBe('l');
  });

  it('removes a unit', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ symbol: 'kg' });
    const id = service.units()[0].id;
    service.remove(id);
    expect(service.units()).toEqual([]);
  });
});
