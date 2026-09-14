import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, form, min, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { FabPanel } from '../../../shared/fab-panel/fab-panel';
import { CategoriesService } from '../../categories/data/categories.service';
import { ProductsService } from '../../products/data/products.service';
import { UnitsService } from '../../units/data/units.service';
import { toExportFilename, toShoppingListExport } from '../data/shopping-list-export';
import { ShoppingListItem, ShoppingListItemId } from '../data/shopping-list.model';
import { ShoppingListsService } from '../data/shopping-lists.service';

interface ItemFormValue {
  productId: string;
  quantity: number;
  note: string;
}

interface QuantityFormValue {
  quantity: number;
}

const EMPTY_ITEM_FORM: ItemFormValue = { productId: '', quantity: 1, note: '' };
const EMPTY_QUANTITY_FORM: QuantityFormValue = { quantity: 1 };

@Component({
  selector: 'app-shopping-list-detail',
  imports: [RouterLink, FormField, FabPanel],
  template: `
    <div class="page">
      <a class="back-link" routerLink="/lists">
        <svg
          class="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        <span>Back to lists</span>
      </a>

      @if (list(); as currentList) {
        <div class="list-header">
          <div class="list-header__title-row">
            <h1>{{ currentList.name }}</h1>
            <span
              class="status-chip"
              [class.status-chip--completed]="currentList.status === 'completed'"
            >
              {{ currentList.status === 'active' ? 'Active' : 'Completed' }}
            </span>
          </div>
          <div class="list-header__actions">
            <button
              type="button"
              class="btn-accent-pill-lg"
              (click)="toggleStatus(currentList.status)"
            >
              {{ currentList.status === 'active' ? 'Mark completed' : 'Mark active' }}
            </button>
            <button
              type="button"
              class="btn-outline-pill"
              (click)="shareList()"
              [attr.aria-label]="'Share ' + currentList.name"
            >
              <svg
                class="icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Share
            </button>
          </div>
        </div>

        @if (itemsByCategory().length === 0) {
          <p class="empty-state">No items yet — add the first one using the + button.</p>
        } @else {
          @for (group of itemsByCategory(); track group.categoryName) {
            <div class="section-heading">
              <h2>{{ group.categoryName }}</h2>
              <span class="section-rule"></span>
            </div>
            <ul class="item-list">
              @for (item of group.items; track item.id) {
                <li class="list-card">
                  <div class="checkbox-wrap">
                    <input
                      type="checkbox"
                      class="sr-checkbox"
                      [id]="'check-' + item.id"
                      [checked]="item.purchased"
                      [disabled]="currentList.status === 'completed'"
                      [attr.aria-label]="item.productName + ' purchased'"
                      (change)="togglePurchased(item.id, item.purchased)"
                    />
                    <label
                      [for]="'check-' + item.id"
                      class="checkbox-face"
                      [class.checkbox-face--checked]="item.purchased"
                    >
                      @if (item.purchased) {
                        <svg
                          class="icon icon--sm"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="3"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      }
                    </label>
                  </div>
                  <div class="list-card__body">
                    <h3 class="item-card__name" [class.item-card__name--purchased]="item.purchased">
                      {{ item.productName }}
                    </h3>
                    <div class="list-card__meta item-card__pills">
                      <span class="pill data-font">{{ item.quantity }} {{ item.unitLabel }}</span>
                      @if (item.note) {
                        <span class="item-card__note">— {{ item.note }}</span>
                      }
                    </div>
                  </div>
                  <div class="list-card__actions">
                    <button
                      type="button"
                      class="icon-btn"
                      [disabled]="currentList.status === 'completed'"
                      (click)="startEditItem(item)"
                      [attr.aria-label]="'Edit ' + item.productName + ' quantity'"
                    >
                      <svg
                        class="icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      [disabled]="currentList.status === 'completed'"
                      (click)="removeItem(item.id)"
                      [attr.aria-label]="'Remove ' + item.productName"
                    >
                      <svg
                        class="icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </div>
                </li>
              }
            </ul>
          }
        }

        @if (currentList.status === 'completed') {
          <p class="empty-state">This list is completed. Mark it active again to add items.</p>
        } @else {
          <app-fab-panel
            [title]="editingItemId() ? 'Edit quantity' : 'Add item'"
            fabLabel="Add item"
            [(open)]="isItemPanelOpen"
          >
            @if (editingItemId()) {
              <form novalidate (submit)="saveItemQuantity($event)">
                <label class="field-label" for="edit-item-quantity">Quantity</label>
                <input
                  #quantityInput
                  id="edit-item-quantity"
                  type="number"
                  class="field-input data-font"
                  step="0.01"
                  [formField]="quantityForm.quantity"
                />
                @if (quantityForm.quantity().invalid() && quantityForm.quantity().touched()) {
                  <span class="field-error">Quantity must be greater than 0.</span>
                }

                <button type="submit" class="btn-accent-pill-lg full-width">Save</button>
                <button type="button" class="btn-outline-pill full-width" (click)="cancelEditItem()">
                  Cancel
                </button>
              </form>
            } @else {
              <form novalidate (submit)="addItem($event)">
                <label class="field-label" for="add-item-product">Product</label>
                <select id="add-item-product" class="field-input" [formField]="itemForm.productId">
                  <option value="" disabled>Select a product</option>
                  @for (product of sortedProducts(); track product.id) {
                    <option [value]="product.id">{{ product.name }}</option>
                  }
                </select>
                @if (itemForm.productId().invalid() && itemForm.productId().touched()) {
                  <span class="field-error">Please select a product.</span>
                }

                <label class="field-label" for="add-item-unit">Unit</label>
                <select
                  id="add-item-unit"
                  class="field-input"
                  [value]="selectedUnitId()"
                  (change)="onUnitChange($event)"
                >
                  @for (unit of unitsService.units(); track unit.id) {
                    <option [value]="unit.id">{{ unit.name }} ({{ unit.symbol }})</option>
                  }
                </select>

                <label class="field-label" for="add-item-quantity">Quantity</label>
                <input
                  id="add-item-quantity"
                  type="number"
                  class="field-input data-font"
                  step="0.01"
                  [formField]="itemForm.quantity"
                />
                @if (itemForm.quantity().invalid() && itemForm.quantity().touched()) {
                  <span class="field-error">Quantity must be greater than 0.</span>
                }

                <label class="field-label" for="add-item-note">Note</label>
                <input
                  id="add-item-note"
                  type="text"
                  class="field-input"
                  [formField]="itemForm.note"
                />

                <button type="submit" class="btn-accent-pill-lg full-width">Add to list</button>
                @if (feedbackMessage()) {
                  <p class="field-info" role="status">{{ feedbackMessage() }}</p>
                }
              </form>
            }
          </app-fab-panel>
        }
      } @else {
        <p>List not found.</p>
      }
    </div>
  `,
  styles: `
    .page {
      max-width: 56.25rem;
      padding-bottom: 8rem;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      color: rgba(20, 32, 29, 0.65);
      text-decoration: none;
      font-weight: 700;
      margin-bottom: 2rem;

      &:hover {
        color: var(--color-ink);
      }
    }

    .list-header {
      margin-bottom: 2.5rem;
    }

    .list-header__title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;

      h1 {
        margin: 0;
        font-size: 2.5rem;
        font-weight: 900;
        letter-spacing: -0.02em;
      }
    }

    .list-header__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .status-chip {
      padding: 0.25rem 1rem;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background-color: rgba(15, 138, 108, 0.1);
      color: var(--color-accent);
      border: 1px solid rgba(15, 138, 108, 0.2);
    }

    .status-chip--completed {
      background-color: rgba(46, 139, 87, 0.12);
      color: var(--app-success);
      border-color: rgba(46, 139, 87, 0.25);
    }

    .item-list {
      list-style: none;
      margin: 0 0 2rem;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .checkbox-wrap {
      position: relative;
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }

    .sr-checkbox {
      position: absolute;
      inset: 0;
      opacity: 0;
      margin: 0;
      cursor: pointer;

      &:disabled {
        cursor: not-allowed;
      }
    }

    .checkbox-face {
      width: 2rem;
      height: 2rem;
      border-radius: 0.625rem;
      border: 2px solid rgba(199, 208, 205, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition:
        border-color 0.15s ease-out,
        background-color 0.15s ease-out;
    }

    .sr-checkbox:hover + .checkbox-face {
      border-color: var(--color-accent);
    }

    .checkbox-face--checked {
      border-color: var(--app-success);
      background-color: var(--app-success);
      color: #ffffff;
    }

    .sr-checkbox:focus-visible + .checkbox-face {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }

    .item-card__name {
      margin: 0 0 0.25rem;
      font-size: 1.125rem;
      font-weight: 700;
      line-height: 1.3;
    }

    .item-card__name--purchased {
      text-decoration: line-through;
      color: var(--app-success);
    }

    .item-card__pills {
      flex-wrap: wrap;
      text-transform: none;
      letter-spacing: normal;
    }

    .item-card__note {
      font-size: 0.875rem;
      font-style: italic;
      color: rgba(20, 32, 29, 0.65);
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

  protected readonly sortedProducts = computed(() =>
    [...this.productsService.products()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  protected readonly itemsByCategory = computed(() => {
    const groups = new Map<string, ShoppingListItem[]>();
    for (const item of this.list()?.items ?? []) {
      const group = groups.get(item.categoryName);
      if (group) {
        group.push(item);
      } else {
        groups.set(item.categoryName, [item]);
      }
    }
    return [...groups.entries()]
      .map(([categoryName, items]) => ({ categoryName, items }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  });

  protected readonly isItemPanelOpen = signal(false);
  protected readonly editingItemId = signal<ShoppingListItemId | null>(null);
  protected readonly feedbackMessage = signal<string | null>(null);
  private feedbackTimeoutId?: ReturnType<typeof setTimeout>;

  private readonly itemModel = signal<ItemFormValue>({ ...EMPTY_ITEM_FORM });
  protected readonly itemForm = form(this.itemModel, (path) => {
    required(path.productId, { message: 'Please select a product.' });
    required(path.quantity);
    min(path.quantity, 0.01);
  });

  private readonly quantityModel = signal<QuantityFormValue>({ ...EMPTY_QUANTITY_FORM });
  protected readonly quantityForm = form(this.quantityModel, (path) => {
    required(path.quantity);
    min(path.quantity, 0.01);
  });

  private readonly quantityInput = viewChild<ElementRef<HTMLInputElement>>('quantityInput');

  protected readonly selectedUnitId = linkedSignal(() => {
    const product = this.productsService
      .products()
      .find((p) => p.id === this.itemForm.productId().value());
    return product?.defaultUnitId ?? '';
  });

  constructor() {
    afterRenderEffect(() => {
      if (this.isItemPanelOpen() && this.editingItemId()) {
        this.quantityInput()?.nativeElement.focus();
      }
    });
  }

  protected onUnitChange(event: Event): void {
    this.selectedUnitId.set((event.target as HTMLSelectElement).value);
  }

  protected toggleStatus(status: 'active' | 'completed'): void {
    this.shoppingListsService.setStatus(this.id(), status === 'active' ? 'completed' : 'active');
  }

  protected async shareList(): Promise<void> {
    const currentList = this.list();
    if (!currentList) {
      return;
    }
    const json = JSON.stringify(toShoppingListExport(currentList), null, 2);
    const file = new File([json], toExportFilename(currentList.name), { type: 'application/json' });

    const shared = await this.tryNativeShare(file, currentList.name);
    if (!shared) {
      this.downloadFile(file);
    }
  }

  private async tryNativeShare(file: File, title: string): Promise<boolean> {
    const nav = navigator as Navigator & {
      canShare?: (data: { files: File[] }) => boolean;
      share?: (data: { files: File[]; title?: string }) => Promise<void>;
    };
    if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function' || !nav.canShare({ files: [file] })) {
      return false;
    }
    try {
      await nav.share({ files: [file], title });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return true;
      }
      return false;
    }
  }

  private downloadFile(file: File): void {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected togglePurchased(itemId: string, purchased: boolean): void {
    this.shoppingListsService.setItemPurchased(this.id(), itemId, !purchased);
  }

  protected removeItem(itemId: string): void {
    this.shoppingListsService.removeItem(this.id(), itemId);
  }

  protected startEditItem(item: ShoppingListItem): void {
    this.editingItemId.set(item.id);
    this.quantityModel.set({ quantity: item.quantity });
    this.isItemPanelOpen.set(true);
  }

  protected cancelEditItem(): void {
    this.editingItemId.set(null);
    this.quantityForm().reset({ ...EMPTY_QUANTITY_FORM });
    this.isItemPanelOpen.set(false);
  }

  protected saveItemQuantity(event: Event): void {
    event.preventDefault();
    this.quantityForm().markAsTouched();
    if (this.quantityForm().invalid()) {
      return;
    }

    const itemId = this.editingItemId();
    if (!itemId) {
      return;
    }

    this.shoppingListsService.updateItemQuantity(this.id(), itemId, this.quantityModel().quantity);
    this.cancelEditItem();
  }

  protected addItem(event: Event): void {
    event.preventDefault();
    this.itemForm().markAsTouched();
    if (this.itemForm().invalid()) {
      return;
    }

    const { productId, quantity, note } = this.itemModel();
    const product = this.productsService.products().find((p) => p.id === productId);
    const unit = this.unitsService.units().find((u) => u.id === this.selectedUnitId());
    const category = this.categoriesService.categories().find((c) => c.id === product?.categoryId);
    if (!product || !unit || !category) {
      return;
    }

    const merged = this.shoppingListsService.addItemFromProduct(
      this.id(),
      product,
      unit,
      category,
      quantity,
      note.trim() ? note.trim() : undefined,
    );

    this.itemForm().reset({ ...EMPTY_ITEM_FORM });
    this.showFeedback(merged ? 'Quantity updated for existing item.' : null);
  }

  private showFeedback(message: string | null): void {
    clearTimeout(this.feedbackTimeoutId);
    this.feedbackMessage.set(message);
    if (message) {
      this.feedbackTimeoutId = setTimeout(() => this.feedbackMessage.set(null), 3000);
    }
  }
}
