import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import {
  afterRenderEffect,
  Component,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { I18n } from '../../../core/i18n/i18n.service';
import { CategoriesService } from '../../categories/data/categories.service';
import { UnitsService } from '../../units/data/units.service';
import { Product } from '../data/product.model';
import { ProductsService } from '../data/products.service';

export interface CreateProductDialogData {
  readonly initialName: string;
}

interface CreateProductFormValue {
  name: string;
  defaultUnitId: string;
  categoryId: string;
}

@Component({
  selector: 'app-create-product-dialog',
  imports: [FormField],
  template: `
    <div class="add-panel">
      <div class="add-panel__header">
        <h2>{{ t('productDialog.title') }}</h2>
      </div>
      <form novalidate (submit)="handleSubmit($event)">
        <label class="field-label" for="create-product-name">{{ t('common.name') }}</label>
        <input
          #nameInput
          id="create-product-name"
          type="text"
          class="field-input"
          [formField]="productForm.name"
        />
        @if (productForm.name().invalid() && productForm.name().touched()) {
          <span class="field-error">{{ t('common.nameRequired') }}</span>
        }
        @if (duplicateNameError()) {
          <p class="field-error" role="alert">{{ t('products.duplicate') }}</p>
        }

        <label class="field-label" for="create-product-unit">{{ t('products.defaultUnit') }}</label>
        <select
          id="create-product-unit"
          class="field-input"
          [formField]="productForm.defaultUnitId"
        >
          <option value="" disabled>{{ t('products.selectUnit') }}</option>
          @for (unit of unitsService.units(); track unit.id) {
            <option [value]="unit.id">{{ unit.symbol }}</option>
          }
        </select>
        @if (productForm.defaultUnitId().invalid() && productForm.defaultUnitId().touched()) {
          <span class="field-error">{{ t('products.unitRequired') }}</span>
        }

        <label class="field-label" for="create-product-category">{{ t('products.category') }}</label>
        <select id="create-product-category" class="field-input" [formField]="productForm.categoryId">
          <option value="" disabled>{{ t('products.selectCategory') }}</option>
          @for (category of categoriesService.categories(); track category.id) {
            <option [value]="category.id">{{ category.name }}</option>
          }
        </select>
        @if (productForm.categoryId().invalid() && productForm.categoryId().touched()) {
          <span class="field-error">{{ t('products.categoryRequired') }}</span>
        }

        <div class="form-actions">
          <button type="button" class="btn-outline-pill" (click)="cancel()">
            {{ t('common.cancel') }}
          </button>
          <button type="submit" class="btn-accent-pill-lg">{{ t('common.create') }}</button>
        </div>
      </form>
    </div>
  `,
})
export class CreateProductDialog {
  protected readonly t = inject(I18n).t;
  protected readonly data = inject<CreateProductDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<Product | undefined>>(DialogRef);
  protected readonly productsService = inject(ProductsService);
  protected readonly unitsService = inject(UnitsService);
  protected readonly categoriesService = inject(CategoriesService);

  protected readonly duplicateNameError = signal(false);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  private readonly model = signal<CreateProductFormValue>({
    name: this.data.initialName,
    defaultUnitId: this.unitsService.defaultUnit()?.id ?? '',
    categoryId: '',
  });
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

    afterRenderEffect(() => {
      this.nameInput()?.nativeElement.focus();
    });
  }

  protected handleSubmit(event: Event): void {
    event.preventDefault();
    this.productForm().markAsTouched();
    if (this.productForm().invalid()) {
      return;
    }

    const value = { ...this.model(), name: this.model().name.trim() };
    if (!value.name) {
      return;
    }

    const isDuplicate = this.productsService
      .products()
      .some((product) => product.name.toLowerCase() === value.name.toLowerCase());
    if (isDuplicate) {
      this.duplicateNameError.set(true);
      return;
    }

    const created = this.productsService.add(value);
    this.dialogRef.close(created);
  }

  protected cancel(): void {
    this.dialogRef.close(undefined);
  }
}
