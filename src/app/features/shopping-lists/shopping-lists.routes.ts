import { Routes } from '@angular/router';
import { ShoppingListDetail } from './shopping-list-detail/shopping-list-detail';
import { ShoppingListsOverview } from './shopping-lists-overview/shopping-lists-overview';

export const SHOPPING_LISTS_ROUTES: Routes = [
  { path: '', component: ShoppingListsOverview },
  { path: ':id', component: ShoppingListDetail },
];
