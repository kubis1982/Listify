export type ShoppingListId = string;
export type ShoppingListItemId = string;

export interface ShoppingListItem {
  id: ShoppingListItemId;
  productName: string;
  unitLabel: string;
  categoryName: string;
  quantity: number;
  purchased: boolean;
  note?: string;
}

export interface ShoppingList {
  id: ShoppingListId;
  name: string;
  createdAt: string;
  status: 'active' | 'completed';
  ownerId: string;
  memberIds: string[];
  items: ShoppingListItem[];
}
