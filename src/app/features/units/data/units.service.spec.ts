import { TestBed } from '@angular/core/testing';
import { UnitsService } from './units.service';

describe('UnitsService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('starts with no units', () => {
    const service = TestBed.inject(UnitsService);
    expect(service.units()).toEqual([]);
  });

  it('adds a unit with a generated id', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ symbol: 'kg' });
    expect(service.units()).toEqual([expect.objectContaining({ symbol: 'kg' })]);
    expect(service.units()[0].id).toBeTruthy();
  });

  it('updates an existing unit', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ symbol: 'kg' });
    const id = service.units()[0].id;
    service.update(id, { symbol: 'oz' });
    expect(service.units()[0].symbol).toBe('oz');
  });

  it('normalizes the symbol to lowercase when adding a unit', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ symbol: 'KG' });
    expect(service.units()[0].symbol).toBe('kg');
  });

  it('normalizes the symbol to lowercase when updating a unit', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ symbol: 'kg' });
    const id = service.units()[0].id;
    service.update(id, { symbol: 'L' });
    expect(service.units()[0].symbol).toBe('l');
  });

  it('removes a unit', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ symbol: 'kg' });
    const id = service.units()[0].id;
    service.remove(id);
    expect(service.units()).toEqual([]);
  });

  it('exposes no default unit when none is set', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ symbol: 'kg' });
    expect(service.defaultUnit()).toBeUndefined();
  });

  it('exposes the unit added as default', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ symbol: 'kg', isDefault: true });
    expect(service.defaultUnit()?.symbol).toBe('kg');
  });

  it('adding a new default unit clears the previous default', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ symbol: 'kg', isDefault: true });
    const firstId = service.units()[0].id;
    service.add({ symbol: 'l', isDefault: true });
    const units = service.units();
    expect(units.find((unit) => unit.id === firstId)?.isDefault).toBe(false);
    expect(units.find((unit) => unit.symbol === 'l')?.isDefault).toBe(true);
  });

  it('updating a unit to be default clears the previous default', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ symbol: 'kg', isDefault: true });
    service.add({ symbol: 'l' });
    const literId = service.units()[1].id;
    service.update(literId, { isDefault: true });
    const units = service.units();
    expect(units.find((unit) => unit.symbol === 'kg')?.isDefault).toBe(false);
    expect(units.find((unit) => unit.id === literId)?.isDefault).toBe(true);
  });
});
