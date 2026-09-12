import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { FormField, form, min, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { CategoriesService } from '../../categories/data/categories.service';
import { ProductsService } from '../../products/data/products.service';
import { UnitsService } from '../../units/data/units.service';
import { ShoppingListsService } from '../data/shopping-lists.service';

interface ItemFormValue {
  quantity: number;
  note: string;
}

const EMPTY_ITEM_FORM: ItemFormValue = { quantity: 1, note: '' };

@Component({
  selector: 'app-shopping-list-detail',
  imports: [RouterLink, FormField],
  template: `
    <a routerLink="/lists">Back to lists</a>

    @if (list(); as currentList) {
      <h1>{{ currentList.name }}</h1>
      <p>Status: {{ currentList.status === 'active' ? 'Active' : 'Completed' }}</p>
      <button type="button" (click)="toggleStatus(currentList.status)">
        {{ currentList.status === 'active' ? 'Mark completed' : 'Mark active' }}
      </button>

      @if (currentList.items.length === 0) {
        <p>No items yet — add the first one below.</p>
      } @else {
        <ul>
          @for (item of currentList.items; track item.id) {
            <li>
              <label>
                <input
                  type="checkbox"
                  [checked]="item.purchased"
                  (change)="togglePurchased(item.id, item.purchased)"
                />
                {{ item.productName }} — {{ item.quantity }} {{ item.unitLabel }} ({{
                  item.categoryName
                }})
                @if (item.note) {
                  <span> — {{ item.note }}</span>
                }
              </label>
              <button type="button" (click)="removeItem(item.id)">Remove</button>
            </li>
          }
        </ul>
      }

      <h2>Add item</h2>
      <form (submit)="addItem($event)">
        <label>
          Product
          <select [value]="productId()" (change)="onProductChange($event)">
            <option value="" disabled>Select a product</option>
            @for (product of productsService.products(); track product.id) {
              <option [value]="product.id">{{ product.name }}</option>
            }
          </select>
        </label>
        @if (productSelectionError()) {
          <p role="alert">Please select a product.</p>
        }

        <label>
          Unit
          <select [value]="selectedUnitId()" (change)="onUnitChange($event)">
            @for (unit of unitsService.units(); track unit.id) {
              <option [value]="unit.id">{{ unit.name }} ({{ unit.symbol }})</option>
            }
          </select>
        </label>

        <label>
          Quantity
          <input type="number" [formField]="itemForm.quantity" step="0.01" />
        </label>
        @if (itemForm.quantity().invalid() && itemForm.quantity().touched()) {
          <p role="alert">Quantity must be greater than 0.</p>
        }

        <label>
          Note
          <input type="text" [formField]="itemForm.note" />
        </label>

        <button type="submit">Add item</button>
      </form>
    } @else {
      <p>List not found.</p>
    }
  `,
})
export class ShoppingListDetail {
  readonly id = input.required<string>();

  protected readonly shoppingListsService = inject(ShoppingListsService);
  protected readonly productsService = inject(ProductsService);
  protected readonly unitsService = inject(UnitsService);
  protected readonly categoriesService = inject(CategoriesService);

  protected readonly list = computed(() =>
    this.shoppingListsService.lists().find((l) => l.id === this.id()),
  );

  protected readonly productId = signal('');
  protected readonly selectedUnitId = linkedSignal(() => {
    const product = this.productsService.products().find((p) => p.id === this.productId());
    return product?.defaultUnitId ?? '';
  });

  private readonly itemModel = signal<ItemFormValue>({ ...EMPTY_ITEM_FORM });
  protected readonly itemForm = form(this.itemModel, (path) => {
    required(path.quantity);
    min(path.quantity, 0.01);
  });

  protected readonly productSelectionError = signal(false);

  constructor() {
    effect(() => {
      this.productId();
      this.productSelectionError.set(false);
    });
  }

  protected onProductChange(event: Event): void {
    this.productId.set((event.target as HTMLSelectElement).value);
  }

  protected onUnitChange(event: Event): void {
    this.selectedUnitId.set((event.target as HTMLSelectElement).value);
  }

  protected toggleStatus(status: 'active' | 'completed'): void {
    this.shoppingListsService.setStatus(this.id(), status === 'active' ? 'completed' : 'active');
  }

  protected togglePurchased(itemId: string, purchased: boolean): void {
    this.shoppingListsService.setItemPurchased(this.id(), itemId, !purchased);
  }

  protected removeItem(itemId: string): void {
    this.shoppingListsService.removeItem(this.id(), itemId);
  }

  protected addItem(event: Event): void {
    event.preventDefault();
    const productId = this.productId();
    if (!productId) {
      this.productSelectionError.set(true);
      return;
    }
    this.productSelectionError.set(false);
    if (this.itemForm().invalid()) {
      return;
    }

    const product = this.productsService.products().find((p) => p.id === productId);
    const unit = this.unitsService.units().find((u) => u.id === this.selectedUnitId());
    const category = this.categoriesService.categories().find((c) => c.id === product?.categoryId);
    if (!product || !unit || !category) {
      return;
    }

    const { quantity, note } = this.itemModel();
    this.shoppingListsService.addItemFromProduct(
      this.id(),
      product,
      unit,
      category,
      quantity,
      note.trim() ? note.trim() : undefined,
    );

    this.productId.set('');
    this.itemModel.set({ ...EMPTY_ITEM_FORM });
  }
}
