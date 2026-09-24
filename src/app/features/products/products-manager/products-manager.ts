import {
  afterRenderEffect,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { I18n } from '../../../core/i18n/i18n.service';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { CreatableTextPicker } from '../../../shared/creatable-text-picker/creatable-text-picker';
import { FabPanel } from '../../../shared/fab-panel/fab-panel';
import { CategoriesService } from '../../categories/data/categories.service';
import { UnitsService } from '../../units/data/units.service';
import { Product, ProductId } from '../data/product.model';
import { ProductsService } from '../data/products.service';

interface ProductFormValue {
  name: string;
  unitSymbol: string;
  categoryName: string;
}

const EMPTY_PRODUCT_FORM: ProductFormValue = { name: '', unitSymbol: '', categoryName: '' };

@Component({
  selector: 'app-products-manager',
  imports: [FormField, FabPanel, CreatableTextPicker],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>{{ t('products.title') }}</h1>
      </div>

      @if (productsService.products().length === 0) {
        <p class="empty-state">{{ t('products.empty') }}</p>
      } @else {
        <div class="list-group">
          @for (product of sortedProducts(); track product.id) {
            <div class="list-card">
              <div class="list-card__body">
                <span class="list-card__name">{{ product.name }}</span>
                <span class="list-card__meta">{{ product.unitSymbol }} · {{ product.categoryName }}</span>
              </div>
              <div class="list-card__actions">
                <button
                  type="button"
                  class="icon-btn"
                  (click)="startEdit(product)"
                  [attr.aria-label]="t('products.editFor', { name: product.name })"
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
                  (click)="remove(product.id)"
                  [attr.aria-label]="t('products.deleteFor', { name: product.name })"
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
            </div>
          }
        </div>
      }
    </div>

    <app-fab-panel
      [title]="editingId() ? t('products.panelEdit') : t('products.panelAdd')"
      [fabLabel]="t('products.panelAdd')"
      [(open)]="isPanelOpen"
      (cancelled)="cancelEdit()"
    >
      <form novalidate (submit)="handleSubmit($event)">
        <label class="field-label" for="product-name">{{ t('common.name') }}</label>
        <input
          #nameInput
          id="product-name"
          type="text"
          class="field-input"
          [formField]="productForm.name"
        />
        @if (productForm.name().invalid() && productForm.name().touched()) {
          <span class="field-error">{{ t('common.nameRequired') }}</span>
        }

        <label class="field-label" for="product-unit">{{ t('products.defaultUnit') }}</label>
        <app-creatable-text-picker
          inputId="product-unit"
          [options]="unitSymbolOptions()"
          [placeholder]="t('products.selectUnit')"
          [hintText]="t('unitPicker.hint')"
          [resultsLabel]="t('unitPicker.results')"
          [createOptionLabel]="unitCreateOptionLabel"
          [onCreate]="createUnit"
          [formField]="productForm.unitSymbol"
        />
        @if (productForm.unitSymbol().invalid() && productForm.unitSymbol().touched()) {
          <span class="field-error">{{ t('products.unitRequired') }}</span>
        }

        <label class="field-label" for="product-category">{{ t('products.category') }}</label>
        <app-creatable-text-picker
          inputId="product-category"
          [options]="categoryNameOptions()"
          [placeholder]="t('products.selectCategory')"
          [hintText]="t('categoryPicker.hint')"
          [resultsLabel]="t('categoryPicker.results')"
          [createOptionLabel]="categoryCreateOptionLabel"
          [onCreate]="createCategory"
          [formField]="productForm.categoryName"
        />
        @if (productForm.categoryName().invalid() && productForm.categoryName().touched()) {
          <span class="field-error">{{ t('products.categoryRequired') }}</span>
        }

        @if (duplicateNameError()) {
          <p class="field-error" role="alert">{{ t('products.duplicate') }}</p>
        }

        <div class="form-actions">
          <button type="button" class="btn-outline-pill" (click)="cancelEdit()">
            {{ t('common.cancel') }}
          </button>
          <button type="submit" class="btn-accent-pill-lg">
            {{ editingId() ? t('common.save') : t('common.add') }}
          </button>
        </div>
      </form>
    </app-fab-panel>
  `,
})
export class ProductsManager {
  protected readonly t = inject(I18n).t;
  protected readonly productsService = inject(ProductsService);
  private readonly confirmDialogService = inject(ConfirmDialogService);
  protected readonly unitsService = inject(UnitsService);
  protected readonly categoriesService = inject(CategoriesService);

  protected readonly editingId = signal<ProductId | null>(null);
  protected readonly duplicateNameError = signal(false);
  protected readonly isPanelOpen = signal(false);

  protected readonly sortedProducts = computed(() =>
    [...this.productsService.products()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  protected readonly unitSymbolOptions = computed(() => {
    const symbols = this.unitsService.units().map((unit) => unit.symbol);
    const current = this.model().unitSymbol;
    return current && !symbols.includes(current) ? [...symbols, current] : symbols;
  });

  protected readonly categoryNameOptions = computed(() => {
    const names = this.categoriesService.categories().map((category) => category.name);
    const current = this.model().categoryName;
    return current && !names.includes(current) ? [...names, current] : names;
  });

  protected readonly unitCreateOptionLabel = (name: string): string =>
    this.t('unitPicker.createOption', { name });
  protected readonly categoryCreateOptionLabel = (name: string): string =>
    this.t('categoryPicker.createOption', { name });

  protected readonly createUnit = (text: string): string => {
    const symbol = text.trim().toLowerCase();
    this.unitsService.add({ symbol });
    return symbol;
  };
  protected readonly createCategory = (text: string): string => {
    const name = text.trim();
    this.categoriesService.add({ name });
    return name;
  };

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  private readonly model = signal<ProductFormValue>(this.buildEmptyProductForm());
  protected readonly productForm = form(this.model, (path) => {
    required(path.name);
    required(path.unitSymbol);
    required(path.categoryName);
  });

  constructor() {
    effect(() => {
      this.productForm.name().value();
      this.duplicateNameError.set(false);
    });

    effect(() => {
      if (!this.isPanelOpen()) {
        this.editingId.set(null);
        this.productForm().reset(this.buildEmptyProductForm());
      }
    });

    afterRenderEffect(() => {
      if (this.isPanelOpen()) {
        this.nameInput()?.nativeElement.focus();
      }
    });
  }

  protected startEdit(product: Product): void {
    this.editingId.set(product.id);
    this.model.set({
      name: product.name,
      unitSymbol: product.unitSymbol,
      categoryName: product.categoryName,
    });
    this.isPanelOpen.set(true);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.productForm().reset(this.buildEmptyProductForm());
    this.isPanelOpen.set(false);
  }

  private buildEmptyProductForm(): ProductFormValue {
    return { ...EMPTY_PRODUCT_FORM, unitSymbol: this.unitsService.defaultUnit()?.symbol ?? '' };
  }

  protected async remove(id: ProductId): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: this.t('products.deleteTitle'),
      message: this.t('products.deleteMessage'),
    });
    if (confirmed) {
      this.productsService.remove(id);
    }
  }

  protected handleSubmit(event: Event): void {
    event.preventDefault();
    if (this.productForm().invalid()) {
      return;
    }

    const value = { ...this.model(), name: this.model().name.trim() };
    if (!value.name) {
      return;
    }

    const editingId = this.editingId();
    const isDuplicate = this.productsService
      .products()
      .some(
        (product) =>
          product.id !== editingId && product.name.toLowerCase() === value.name.toLowerCase(),
      );
    if (isDuplicate) {
      this.duplicateNameError.set(true);
      return;
    }

    if (editingId) {
      this.productsService.update(editingId, value);
      this.cancelEdit();
    } else {
      this.productsService.add(value);
      this.productForm().reset(this.buildEmptyProductForm());
      this.nameInput()?.nativeElement.focus();
    }
  }
}
