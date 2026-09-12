import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'lists' },
  {
    path: 'lists',
    loadChildren: () =>
      import('./features/shopping-lists/shopping-lists.routes').then(
        (m) => m.SHOPPING_LISTS_ROUTES,
      ),
  },
  {
    path: 'products',
    loadChildren: () =>
      import('./features/products/products.routes').then((m) => m.PRODUCTS_ROUTES),
  },
  {
    path: 'units',
    loadChildren: () => import('./features/units/units.routes').then((m) => m.UNITS_ROUTES),
  },
  {
    path: 'categories',
    loadChildren: () =>
      import('./features/categories/categories.routes').then((m) => m.CATEGORIES_ROUTES),
  },
];
