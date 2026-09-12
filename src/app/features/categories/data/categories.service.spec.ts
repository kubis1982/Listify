import { TestBed } from '@angular/core/testing';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('starts with no categories', () => {
    const service = TestBed.inject(CategoriesService);
    expect(service.categories()).toEqual([]);
  });

  it('adds a category with a generated id', () => {
    const service = TestBed.inject(CategoriesService);
    service.add({ name: 'Dairy' });
    expect(service.categories()).toEqual([expect.objectContaining({ name: 'Dairy' })]);
    expect(service.categories()[0].id).toBeTruthy();
  });

  it('updates an existing category', () => {
    const service = TestBed.inject(CategoriesService);
    service.add({ name: 'Dairy' });
    const id = service.categories()[0].id;
    service.update(id, { name: 'Dairy & Eggs' });
    expect(service.categories()[0].name).toBe('Dairy & Eggs');
  });

  it('removes a category', () => {
    const service = TestBed.inject(CategoriesService);
    service.add({ name: 'Dairy' });
    const id = service.categories()[0].id;
    service.remove(id);
    expect(service.categories()).toEqual([]);
  });
});
