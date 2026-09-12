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
    service.add({ name: 'Kilogram', symbol: 'kg' });
    expect(service.units()).toEqual([
      expect.objectContaining({ name: 'Kilogram', symbol: 'kg' }),
    ]);
    expect(service.units()[0].id).toBeTruthy();
  });

  it('updates an existing unit', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ name: 'Kilogram', symbol: 'kg' });
    const id = service.units()[0].id;
    service.update(id, { symbol: 'KG' });
    expect(service.units()[0].symbol).toBe('KG');
  });

  it('removes a unit', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ name: 'Kilogram', symbol: 'kg' });
    const id = service.units()[0].id;
    service.remove(id);
    expect(service.units()).toEqual([]);
  });
});
