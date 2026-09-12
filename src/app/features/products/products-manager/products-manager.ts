import { Component, effect, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
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
  imports: [FormField],
  template: `
    <h1>Products</h1>

    @if (productsService.products().length === 0) {
      <p>No products yet — add the first one below.</p>
    } @else {
      <ul>
        @for (product of productsService.products(); track product.id) {
          <li>
            <span
              >{{ product.name }} — {{ unitLabel(product.defaultUnitId) }},
              {{ categoryLabel(product.categoryId) }}</span
            >
            <button type="button" (click)="startEdit(product)">Edit</button>
            <button type="button" (click)="remove(product.id)">Delete</button>
          </li>
        }
      </ul>
    }

    <h2>{{ editingId() ? 'Edit product' : 'Add product' }}</h2>
    <form (submit)="handleSubmit($event)">
      <label>
        Name
        <input type="text" [formField]="productForm.name" />
      </label>
      @if (productForm.name().invalid() && productForm.name().touched()) {
        <p role="alert">Name is required.</p>
      }

      <label>
        Default unit
        <select [formField]="productForm.defaultUnitId">
          <option value="" disabled>Select a unit</option>
          @for (unit of unitsService.units(); track unit.id) {
            <option [value]="unit.id">{{ unit.name }} ({{ unit.symbol }})</option>
          }
        </select>
      </label>
      @if (productForm.defaultUnitId().invalid() && productForm.defaultUnitId().touched()) {
        <p role="alert">A unit is required.</p>
      }

      <label>
        Category
        <select [formField]="productForm.categoryId">
          <option value="" disabled>Select a category</option>
          @for (category of categoriesService.categories(); track category.id) {
            <option [value]="category.id">{{ category.name }}</option>
          }
        </select>
      </label>
      @if (productForm.categoryId().invalid() && productForm.categoryId().touched()) {
        <p role="alert">A category is required.</p>
      }

      @if (duplicateNameError()) {
        <p role="alert">A product with this name already exists.</p>
      }

      <button type="submit">{{ editingId() ? 'Save' : 'Add' }}</button>
      @if (editingId()) {
        <button type="button" (click)="cancelEdit()">Cancel</button>
      }
    </form>
  `,
})
export class ProductsManager {
  protected readonly productsService = inject(ProductsService);
  protected readonly unitsService = inject(UnitsService);
  protected readonly categoriesService = inject(CategoriesService);

  protected readonly editingId = signal<ProductId | null>(null);
  protected readonly duplicateNameError = signal(false);

  private readonly model = signal<ProductFormValue>({ ...EMPTY_PRODUCT_FORM });
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
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.productForm().reset({ ...EMPTY_PRODUCT_FORM });
  }

  protected remove(id: ProductId): void {
    if (confirm('Delete this product?')) {
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
    } else {
      this.productsService.add(value);
    }
    this.cancelEdit();
  }
}
