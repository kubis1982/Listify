import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
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
import { CreatableTextPicker } from '../../../shared/creatable-text-picker/creatable-text-picker';
import { CategoriesService } from '../../categories/data/categories.service';
import { UnitsService } from '../../units/data/units.service';
import { Product } from '../data/product.model';
import { ProductsService } from '../data/products.service';

export interface CreateProductDialogData {
  readonly initialName: string;
}

interface CreateProductFormValue {
  name: string;
  unitSymbol: string;
  categoryName: string;
}

@Component({
  selector: 'app-create-product-dialog',
  imports: [FormField, CreatableTextPicker],
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
        <app-creatable-text-picker
          inputId="create-product-unit"
          [options]="unitSymbols()"
          [placeholder]="t('products.selectUnit')"
          [hintText]="t('unitPicker.hint')"
          [resultsLabel]="t('unitPicker.results')"
          [createOptionLabel]="unitCreateOptionLabel"
          [clearLabel]="t('unitPicker.clear')"
          [toggleLabel]="t('unitPicker.toggle')"
          [onCreate]="createUnit"
          [formField]="productForm.unitSymbol"
        />
        @if (productForm.unitSymbol().invalid() && productForm.unitSymbol().touched()) {
          <span class="field-error">{{ t('products.unitRequired') }}</span>
        }

        <label class="field-label" for="create-product-category">{{ t('products.category') }}</label>
        <app-creatable-text-picker
          inputId="create-product-category"
          [options]="categoryNames()"
          [placeholder]="t('products.selectCategory')"
          [hintText]="t('categoryPicker.hint')"
          [resultsLabel]="t('categoryPicker.results')"
          [createOptionLabel]="categoryCreateOptionLabel"
          [clearLabel]="t('categoryPicker.clear')"
          [toggleLabel]="t('categoryPicker.toggle')"
          [onCreate]="createCategory"
          [formField]="productForm.categoryName"
        />
        @if (productForm.categoryName().invalid() && productForm.categoryName().touched()) {
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

  protected readonly unitSymbols = computed(() => this.unitsService.units().map((unit) => unit.symbol));
  protected readonly categoryNames = computed(() =>
    this.categoriesService.categories().map((category) => category.name),
  );

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

  private readonly model = signal<CreateProductFormValue>({
    name: this.data.initialName,
    unitSymbol: this.unitsService.defaultUnit()?.symbol ?? '',
    categoryName: '',
  });
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
