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
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { FabPanel } from '../../../shared/fab-panel/fab-panel';
import { CategoriesService } from '../../categories/data/categories.service';
import { UnitsService } from '../../units/data/units.service';
import { Product, ProductId } from '../data/product.model';
import { ProductsService } from '../data/products.service';

interface ProductFormValue {
  name: string;
  defaultUnitId: string;
  categoryId: string;
}

const EMPTY_PRODUCT_FORM: ProductFormValue = { name: '', defaultUnitId: '', categoryId: '' };

@Component({
  selector: 'app-products-manager',
  imports: [FormField, FabPanel],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Products</h1>
      </div>

      @if (productsService.products().length === 0) {
        <p class="empty-state">No products yet — add the first one using the + button.</p>
      } @else {
        <div class="list-group">
          @for (product of sortedProducts(); track product.id) {
            <div class="list-card">
              <div class="list-card__body">
                <span class="list-card__name">{{ product.name }}</span>
                <span class="list-card__meta"
                  >{{ unitLabel(product.defaultUnitId) }} · {{ categoryLabel(product.categoryId) }}</span
                >
              </div>
              <div class="list-card__actions">
                <button
                  type="button"
                  class="icon-btn"
                  (click)="startEdit(product)"
                  [attr.aria-label]="'Edit ' + product.name"
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
                  [attr.aria-label]="'Delete ' + product.name"
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
      [title]="editingId() ? 'Edit product' : 'Add product'"
      fabLabel="Add product"
      [(open)]="isPanelOpen"
    >
      <form novalidate (submit)="handleSubmit($event)">
        <label class="field-label" for="product-name">Name</label>
        <input
          #nameInput
          id="product-name"
          type="text"
          class="field-input"
          [formField]="productForm.name"
        />
        @if (productForm.name().invalid() && productForm.name().touched()) {
          <span class="field-error">Name is required.</span>
        }

        <label class="field-label" for="product-unit">Default unit</label>
        <select id="product-unit" class="field-input" [formField]="productForm.defaultUnitId">
          <option value="" disabled>Select a unit</option>
          @for (unit of unitsService.units(); track unit.id) {
            <option [value]="unit.id">{{ unit.name }} ({{ unit.symbol }})</option>
          }
        </select>
        @if (productForm.defaultUnitId().invalid() && productForm.defaultUnitId().touched()) {
          <span class="field-error">A unit is required.</span>
        }

        <label class="field-label" for="product-category">Category</label>
        <select id="product-category" class="field-input" [formField]="productForm.categoryId">
          <option value="" disabled>Select a category</option>
          @for (category of categoriesService.categories(); track category.id) {
            <option [value]="category.id">{{ category.name }}</option>
          }
        </select>
        @if (productForm.categoryId().invalid() && productForm.categoryId().touched()) {
          <span class="field-error">A category is required.</span>
        }

        @if (duplicateNameError()) {
          <p class="field-error" role="alert">A product with this name already exists.</p>
        }

        <div class="form-actions">
          <button type="button" class="btn-outline-pill" (click)="cancelEdit()">Cancel</button>
          <button type="submit" class="btn-accent-pill-lg">
            {{ editingId() ? 'Save' : 'Add' }}
          </button>
        </div>
      </form>
    </app-fab-panel>
  `,
})
export class ProductsManager {
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

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  private readonly model = signal<ProductFormValue>(this.buildEmptyProductForm());
  protected readonly productForm = form(this.model, (path) => {
    required(path.name);
    required(path.defaultUnitId);
    required(path.categoryId);
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

  protected unitLabel(unitId: string): string {
    const unit = this.unitsService.units().find((u) => u.id === unitId);
    return unit ? `${unit.name} (${unit.symbol})` : 'Unknown unit';
  }

  protected categoryLabel(categoryId: string): string {
    const category = this.categoriesService.categories().find((c) => c.id === categoryId);
    return category ? category.name : 'Unknown category';
  }

  protected startEdit(product: Product): void {
    this.editingId.set(product.id);
    this.model.set({
      name: product.name,
      defaultUnitId: product.defaultUnitId,
      categoryId: product.categoryId,
    });
    this.isPanelOpen.set(true);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.productForm().reset(this.buildEmptyProductForm());
    this.isPanelOpen.set(false);
  }

  private buildEmptyProductForm(): ProductFormValue {
    return { ...EMPTY_PRODUCT_FORM, defaultUnitId: this.unitsService.defaultUnit()?.id ?? '' };
  }

  protected async remove(id: ProductId): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: 'Delete this product?',
      message: 'This will permanently remove the product.',
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
