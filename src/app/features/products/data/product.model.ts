import { CategoryId } from '../../categories/data/category.model';
import { UnitId } from '../../units/data/unit.model';

export type ProductId = string;

export interface Product {
  id: ProductId;
  name: string;
  defaultUnitId: UnitId;
  categoryId: CategoryId;
}
