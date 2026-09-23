export type ProductId = string;

export interface Product {
  id: ProductId;
  name: string;
  unitSymbol: string;
  categoryName: string;
}
