import { Dialog } from '@angular/cdk/dialog';
import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormField, form, min, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { I18n } from '../../../core/i18n/i18n.service';
import { TranslationKey } from '../../../core/i18n/translations/en';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { CreatableTextPicker } from '../../../shared/creatable-text-picker/creatable-text-picker';
import { FabPanel } from '../../../shared/fab-panel/fab-panel';
import { ProductPicker } from '../../../shared/product-picker/product-picker';
import { CategoriesService } from '../../categories/data/categories.service';
import { ProductsService } from '../../products/data/products.service';
import { UnitsService } from '../../units/data/units.service';
import { toExportFilename, toShoppingListExport } from '../data/shopping-list-export';
import { ShoppingListItem, ShoppingListItemId } from '../data/shopping-list.model';
import { ShoppingListsService } from '../data/shopping-lists.service';
import { ShareListDialog, ShareListDialogData } from '../share-list-dialog/share-list-dialog';

interface ItemFormValue {
  productName: string;
  quantity: number;
  unitSymbol: string;
  categoryName: string;
  note: string;
}

interface EditItemFormValue {
  quantity: number;
  note: string;
}

const EMPTY_ITEM_FORM: ItemFormValue = {
  productName: '',
  quantity: 1,
  unitSymbol: '',
  categoryName: '',
  note: '',
};
const EMPTY_EDIT_ITEM_FORM: EditItemFormValue = { quantity: 1, note: '' };

@Component({
  selector: 'app-shopping-list-detail',
  imports: [RouterLink, FormField, FabPanel, ProductPicker, CreatableTextPicker],
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
        <span>{{ t('listDetail.back') }}</span>
      </a>

      @if (list(); as currentList) {
        <div class="list-header">
          <div class="list-header__title-row">
            <h1>{{ currentList.name }}</h1>
            <span
              class="status-chip"
              [class.status-chip--completed]="currentList.status === 'completed'"
            >
              {{ currentList.status === 'active' ? t('listDetail.statusActive') : t('listDetail.statusCompleted') }}
            </span>
          </div>
          <div class="list-header__actions">
            <button
              type="button"
              class="btn-accent-pill-lg"
              (click)="toggleStatus(currentList.status)"
            >
              {{ currentList.status === 'active' ? t('listDetail.markCompleted') : t('listDetail.markActive') }}
            </button>
            <button
              type="button"
              class="btn-outline-pill"
              (click)="openShareDialog()"
              [attr.aria-label]="t('listDetail.shareFor', { name: currentList.name })"
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
              {{ t('listDetail.share') }}
            </button>
            <button
              type="button"
              class="btn-outline-pill"
              (click)="exportList()"
              [attr.aria-label]="t('listDetail.exportFor', { name: currentList.name })"
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
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {{ t('listDetail.export') }}
            </button>
          </div>
        </div>

        @if (totalItemsCount() > 0) {
          <div class="progress">
            <div class="progress__label">
              <span class="data-font">{{ t('listDetail.progress', { purchased: purchasedItemsCount(), total: totalItemsCount() }) }}</span>
              <span class="data-font">{{ progressPercent() }}%</span>
            </div>
            <div class="progress__track">
              <div class="progress__fill" [style.width.%]="progressPercent()"></div>
            </div>
          </div>
        }

        @if (itemsByCategory().length === 0) {
          <p class="empty-state">{{ t('listDetail.empty') }}</p>
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
                      [attr.aria-label]="t('listDetail.itemPurchased', { name: item.productName })"
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
                      [attr.aria-label]="t('listDetail.editItemFor', { name: item.productName })"
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
                      [attr.aria-label]="t('listDetail.removeFor', { name: item.productName })"
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
          <p class="empty-state">{{ t('listDetail.completedNotice') }}</p>
        } @else {
          <app-fab-panel
            [title]="editingItemId() ? t('listDetail.panelEditItem') : t('listDetail.panelAddItem')"
            [fabLabel]="t('listDetail.panelAddItem')"
            [(open)]="isItemPanelOpen"
            (cancelled)="cancel()"
          >
            @if (editingItemId()) {
              <form novalidate (submit)="saveItemEdit($event)">
                <label class="field-label" for="edit-item-quantity">{{ t('common.quantity') }}</label>
                <div class="quantity-stepper">
                  <button
                    type="button"
                    class="quantity-stepper__btn"
                    (click)="adjustQuantity(-1)"
                    [attr.aria-label]="t('common.decreaseQuantity')"
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
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                  <input
                    #quantityInput
                    id="edit-item-quantity"
                    type="number"
                    class="field-input data-font quantity-stepper__input"
                    step="0.01"
                    [formField]="editItemForm.quantity"
                  />
                  <button
                    type="button"
                    class="quantity-stepper__btn"
                    (click)="adjustQuantity(1)"
                    [attr.aria-label]="t('common.increaseQuantity')"
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
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>
                @if (editItemForm.quantity().invalid() && editItemForm.quantity().touched()) {
                  <span class="field-error">{{ t('common.quantityInvalid') }}</span>
                }

                <label class="field-label" for="edit-item-note">{{ t('listDetail.note') }}</label>
                <input
                  id="edit-item-note"
                  type="text"
                  class="field-input"
                  [formField]="editItemForm.note"
                />

                <div class="form-actions">
                  <button type="button" class="btn-outline-pill" (click)="cancel()">{{ t('common.cancel') }}</button>
                  <button type="submit" class="btn-accent-pill-lg">{{ t('common.save') }}</button>
                </div>
              </form>
            } @else {
              <form novalidate (submit)="addItem($event)">
                <label class="field-label" for="add-item-product">{{ t('listDetail.product') }}</label>
                <app-product-picker
                  [inputId]="'add-item-product'"
                  [products]="sortedProducts()"
                  [formField]="itemForm.productName"
                  (productSelected)="focusItemQuantity()"
                />
                @if (itemForm.productName().invalid() && itemForm.productName().touched()) {
                  <span class="field-error">{{ t('listDetail.productRequired') }}</span>
                } @else if (isNewProduct()) {
                  <span class="field-info">{{ t('listDetail.newProductHint') }}</span>
                }

                <div class="field-row">
                  <div class="field-group">
                    <label class="field-label" for="add-item-quantity">{{ t('common.quantity') }}</label>
                    <div class="quantity-stepper">
                      <button
                        type="button"
                        class="quantity-stepper__btn"
                        (click)="adjustItemQuantity(-1)"
                        [attr.aria-label]="t('common.decreaseQuantity')"
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
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </button>
                      <input
                        #addItemQuantityInput
                        id="add-item-quantity"
                        type="number"
                        class="field-input data-font quantity-stepper__input"
                        step="0.01"
                        [formField]="itemForm.quantity"
                      />
                      <button
                        type="button"
                        class="quantity-stepper__btn"
                        (click)="adjustItemQuantity(1)"
                        [attr.aria-label]="t('common.increaseQuantity')"
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
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </button>
                    </div>
                    @if (itemForm.quantity().invalid() && itemForm.quantity().touched()) {
                      <span class="field-error">{{ t('common.quantityInvalid') }}</span>
                    }
                  </div>
                  <div class="field-group">
                    <label class="field-label" for="add-item-unit">{{ t('listDetail.unit') }}</label>
                    <app-creatable-text-picker
                      inputId="add-item-unit"
                      [options]="unitSymbols()"
                      [hintText]="t('unitPicker.hint')"
                      [resultsLabel]="t('unitPicker.results')"
                      [createOptionLabel]="unitCreateOptionLabel"
                      [clearLabel]="t('unitPicker.clear')"
                      [toggleLabel]="t('unitPicker.toggle')"
                      [allowCreate]="isNewProduct()"
                      [onCreate]="normalizeUnitSymbol"
                      [formField]="itemForm.unitSymbol"
                    />
                    @if (itemForm.unitSymbol().invalid() && itemForm.unitSymbol().touched()) {
                      <span class="field-error">{{ t('listDetail.unitRequired') }}</span>
                    }
                  </div>
                </div>

                <label class="field-label" for="add-item-category">{{ t('listDetail.category') }}</label>
                <app-creatable-text-picker
                  inputId="add-item-category"
                  [options]="categoryNames()"
                  [hintText]="t('categoryPicker.hint')"
                  [resultsLabel]="t('categoryPicker.results')"
                  [createOptionLabel]="categoryCreateOptionLabel"
                  [clearLabel]="t('categoryPicker.clear')"
                  [toggleLabel]="t('categoryPicker.toggle')"
                  [allowCreate]="isNewProduct()"
                  [onCreate]="normalizeCategoryName"
                  [formField]="itemForm.categoryName"
                />
                @if (itemForm.categoryName().invalid() && itemForm.categoryName().touched()) {
                  <span class="field-error">{{ t('listDetail.categoryRequired') }}</span>
                }

                <label class="field-label" for="add-item-note">{{ t('listDetail.note') }}</label>
                <input
                  id="add-item-note"
                  type="text"
                  class="field-input"
                  [formField]="itemForm.note"
                />

                <div class="form-actions">
                  <button type="button" class="btn-outline-pill" (click)="cancel()">{{ t('common.cancel') }}</button>
                  <button type="submit" class="btn-accent-pill-lg">{{ t('listDetail.addToList') }}</button>
                </div>
                @if (feedbackKey(); as key) {
                  <p class="field-info" role="status">{{ t(key) }}</p>
                }
              </form>
            }
          </app-fab-panel>
        }
      } @else {
        <p>{{ t('listDetail.notFound') }}</p>
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

    .progress {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 2rem;
    }

    .progress__label {
      display: flex;
      justify-content: space-between;
      font-size: 0.8125rem;
      color: rgba(20, 32, 29, 0.65);
    }

    .progress__track {
      height: 5px;
      border-radius: 999px;
      background-color: rgba(199, 208, 205, 0.5);
      overflow: hidden;
    }

    .progress__fill {
      height: 100%;
      border-radius: 999px;
      background-color: var(--color-accent);
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

    .field-row {
      display: flex;
      gap: 0.75rem;

      .field-group {
        flex: 1;
        min-width: 0;
      }

      .field-label {
        margin-top: 0.75rem;
      }
    }

    .quantity-stepper {
      display: flex;
      align-items: stretch;
      border: 1px solid rgba(199, 208, 205, 0.6);
      border-radius: 0.625rem;
      overflow: hidden;
      background-color: var(--color-paper);

      &:focus-within {
        border-color: var(--color-accent);
      }
    }

    .quantity-stepper__input {
      flex: 1;
      min-width: 0;
      border: none;
      border-radius: 0;
      text-align: center;
      -moz-appearance: textfield;

      &:focus-visible {
        outline: none;
      }

      &::-webkit-inner-spin-button,
      &::-webkit-outer-spin-button {
        appearance: none;
        margin: 0;
      }
    }

    .quantity-stepper__btn {
      flex-shrink: 0;
      width: 2.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: rgba(20, 32, 29, 0.55);
      cursor: pointer;
      transition:
        background-color 0.15s ease-out,
        color 0.15s ease-out;

      &:hover {
        background-color: rgba(15, 138, 108, 0.08);
        color: var(--color-accent);
      }

      &:active {
        background-color: rgba(15, 138, 108, 0.16);
      }
    }
  `,
})
export class ShoppingListDetail {
  readonly id = input.required<string>();

  protected readonly t = inject(I18n).t;

  private readonly injector = inject(Injector);
  private readonly dialog = inject(Dialog);
  private readonly confirmDialogService = inject(ConfirmDialogService);
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

  protected readonly totalItemsCount = computed(() => this.list()?.items.length ?? 0);

  protected readonly purchasedItemsCount = computed(
    () => this.list()?.items.filter((item) => item.purchased).length ?? 0,
  );

  protected readonly progressPercent = computed(() => {
    const total = this.totalItemsCount();
    return total === 0 ? 0 : Math.round((this.purchasedItemsCount() / total) * 100);
  });

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
      .map(([categoryName, items]) => ({
        categoryName,
        items: [...items].sort((a, b) => a.productName.localeCompare(b.productName)),
      }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  });

  protected readonly isItemPanelOpen = signal(false);
  protected readonly editingItemId = signal<ShoppingListItemId | null>(null);
  protected readonly feedbackKey = signal<TranslationKey | null>(null);
  private feedbackTimeoutId?: ReturnType<typeof setTimeout>;

  private readonly itemModel = signal<ItemFormValue>({ ...EMPTY_ITEM_FORM });
  protected readonly itemForm = form(this.itemModel, (path) => {
    required(path.productName, { message: () => this.t('listDetail.productRequired') });
    required(path.quantity);
    min(path.quantity, 0.01);
    required(path.unitSymbol);
    required(path.categoryName);
  });

  private readonly editItemModel = signal<EditItemFormValue>({ ...EMPTY_EDIT_ITEM_FORM });
  protected readonly editItemForm = form(this.editItemModel, (path) => {
    required(path.quantity);
    min(path.quantity, 0.01);
  });

  private readonly quantityInput = viewChild<ElementRef<HTMLInputElement>>('quantityInput');
  private readonly addItemQuantityInput = viewChild<ElementRef<HTMLInputElement>>(
    'addItemQuantityInput',
  );
  private readonly productPicker = viewChild(ProductPicker);

  /** The registered product whose name matches the typed one, if any. */
  protected readonly matchedProduct = computed(() => {
    const name = this.itemForm.productName().value().trim().toLowerCase();
    return name
      ? this.productsService.products().find((product) => product.name.toLowerCase() === name)
      : undefined;
  });

  protected readonly isNewProduct = computed(
    () => this.itemForm.productName().value().trim() !== '' && !this.matchedProduct(),
  );

  protected readonly unitSymbols = computed(() => this.unitsService.units().map((unit) => unit.symbol));
  protected readonly categoryNames = computed(() =>
    this.categoriesService.categories().map((category) => category.name),
  );

  protected readonly unitCreateOptionLabel = (name: string): string =>
    this.t('unitPicker.createOption', { name });
  protected readonly categoryCreateOptionLabel = (name: string): string =>
    this.t('categoryPicker.createOption', { name });

  // New units and categories picked here are only held in the form; they get
  // registered on submit, and only if the user agrees to register the product.
  protected readonly normalizeUnitSymbol = (text: string): string => text.trim().toLowerCase();
  protected readonly normalizeCategoryName = (text: string): string => text.trim();

  // `undefined` until the first run, so the initial empty form also gets the
  // new-product defaults applied.
  private previousMatchedProductId: string | null | undefined;

  constructor() {
    afterRenderEffect(() => {
      if (!this.isItemPanelOpen()) {
        return;
      }
      if (this.editingItemId()) {
        this.quantityInput()?.nativeElement.focus();
      } else {
        this.productPicker()?.focus();
      }
    });

    // Fills unit and category from the product whenever the typed name starts
    // or stops matching a registered product. Only reacts to that transition,
    // so the user can still change the prefilled values afterwards.
    effect(() => {
      const product = this.matchedProduct();
      const productId = product?.id ?? null;
      if (productId === this.previousMatchedProductId) {
        return;
      }
      this.previousMatchedProductId = productId;
      const defaults = product
        ? { unitSymbol: product.unitSymbol, categoryName: product.categoryName }
        : { unitSymbol: untracked(this.unitsService.defaultUnit)?.symbol ?? '', categoryName: '' };
      this.itemModel.update((value) => ({ ...value, ...defaults }));
    });

    // Units load asynchronously, so the default unit may arrive after the form
    // was prefilled; fill it in if the new-product unit is still empty.
    effect(() => {
      const symbol = this.unitsService.defaultUnit()?.symbol;
      if (symbol && !this.matchedProduct() && !untracked(this.itemModel).unitSymbol) {
        this.itemModel.update((value) => ({ ...value, unitSymbol: symbol }));
      }
    });
  }

  protected focusItemQuantity(): void {
    // MatAutocompleteTrigger refocuses its own input right after emitting
    // `optionSelected`, so move focus only once that has settled.
    afterNextRender(() => this.addItemQuantityInput()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  protected adjustItemQuantity(delta: number): void {
    this.itemModel.update((value) => ({
      ...value,
      quantity: Math.max(0.01, Math.round((value.quantity + delta) * 100) / 100),
    }));
  }

  protected adjustQuantity(delta: number): void {
    this.editItemModel.update((value) => ({
      ...value,
      quantity: Math.max(0.01, Math.round((value.quantity + delta) * 100) / 100),
    }));
  }

  protected openShareDialog(): void {
    this.dialog.open<void, ShareListDialogData>(ShareListDialog, {
      data: { listId: this.id() },
      ariaLabelledBy: 'share-dialog-title',
    });
  }

  protected toggleStatus(status: 'active' | 'completed'): void {
    this.shoppingListsService.setStatus(this.id(), status === 'active' ? 'completed' : 'active');
  }

  protected async exportList(): Promise<void> {
    const currentList = this.list();
    if (!currentList) {
      return;
    }
    const json = JSON.stringify(toShoppingListExport(currentList), null, 2);
    const file = new File([json], toExportFilename(currentList.name), { type: 'text/plain' });

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
    this.editItemModel.set({ quantity: item.quantity, note: item.note ?? '' });
    this.isItemPanelOpen.set(true);
  }

  protected cancel(): void {
    this.editingItemId.set(null);
    this.resetItemForm();
    this.editItemForm().reset({ ...EMPTY_EDIT_ITEM_FORM });
    this.isItemPanelOpen.set(false);
  }

  protected saveItemEdit(event: Event): void {
    event.preventDefault();
    this.editItemForm().markAsTouched();
    if (this.editItemForm().invalid()) {
      return;
    }

    const itemId = this.editingItemId();
    if (!itemId) {
      return;
    }

    const { quantity, note } = this.editItemModel();
    this.shoppingListsService.updateItem(this.id(), itemId, quantity, note.trim() ? note.trim() : undefined);
    this.cancel();
  }

  protected async addItem(event: Event): Promise<void> {
    event.preventDefault();
    this.itemForm().markAsTouched();
    if (this.itemForm().invalid()) {
      return;
    }

    const { productName, quantity, unitSymbol, categoryName, note } = this.itemModel();
    const name = productName.trim();
    if (!name) {
      return;
    }

    const product = this.matchedProduct();
    if (!product) {
      const register = await this.confirmDialogService.ask({
        title: this.t('listDetail.registerProductTitle'),
        message: this.t('listDetail.registerProductMessage', { name }),
        confirmLabel: this.t('listDetail.registerProductConfirm'),
        cancelLabel: this.t('listDetail.registerProductDecline'),
      });
      if (register === undefined) {
        return;
      }
      if (register) {
        this.registerProduct(name, unitSymbol, categoryName);
      }
    }

    const merged = this.shoppingListsService.addItem(
      this.id(),
      { name: product?.name ?? name, categoryName },
      unitSymbol,
      quantity,
      note.trim() ? note.trim() : undefined,
    );

    this.resetItemForm();
    this.showFeedback(merged ? 'listDetail.mergedFeedback' : null);
  }

  private registerProduct(name: string, unitSymbol: string, categoryName: string): void {
    const unitExists = this.unitsService
      .units()
      .some((unit) => unit.symbol.toLowerCase() === unitSymbol.toLowerCase());
    if (!unitExists) {
      this.unitsService.add({ symbol: unitSymbol });
    }
    const categoryExists = this.categoriesService
      .categories()
      .some((category) => category.name.toLowerCase() === categoryName.toLowerCase());
    if (!categoryExists) {
      this.categoriesService.add({ name: categoryName });
    }
    this.productsService.add({ name, unitSymbol, categoryName });
  }

  private resetItemForm(): void {
    this.itemForm().reset({
      ...EMPTY_ITEM_FORM,
      unitSymbol: this.unitsService.defaultUnit()?.symbol ?? '',
    });
  }

  private showFeedback(key: TranslationKey | null): void {
    clearTimeout(this.feedbackTimeoutId);
    this.feedbackKey.set(key);
    if (key) {
      this.feedbackTimeoutId = setTimeout(() => this.feedbackKey.set(null), 3000);
    }
  }
}
