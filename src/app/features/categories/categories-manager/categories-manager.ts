import { Component, effect, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { Category, CategoryId } from '../data/category.model';
import { CategoriesService } from '../data/categories.service';

interface CategoryFormValue {
  name: string;
}

const EMPTY_CATEGORY_FORM: CategoryFormValue = { name: '' };

@Component({
  selector: 'app-categories-manager',
  imports: [FormField, MatButtonModule, MatFormFieldModule, MatInputModule, MatListModule],
  template: `
    <h1>Categories</h1>

    @if (categoriesService.categories().length === 0) {
      <p>No categories yet — add the first one below.</p>
    } @else {
      <mat-list>
        @for (category of categoriesService.categories(); track category.id) {
          <mat-list-item>
            <span matListItemTitle>{{ category.name }}</span>
            <span matListItemMeta class="row-actions">
              <button matButton="text" type="button" (click)="startEdit(category)">Edit</button>
              <button matButton="text" type="button" (click)="remove(category.id)">Delete</button>
            </span>
          </mat-list-item>
        }
      </mat-list>
    }

    <h2>{{ editingId() ? 'Edit category' : 'Add category' }}</h2>
    <form class="category-form" (submit)="handleSubmit($event)">
      <mat-form-field appearance="outline">
        <mat-label>Name</mat-label>
        <input matInput type="text" [formField]="categoryForm.name" />
        @if (categoryForm.name().invalid() && categoryForm.name().touched()) {
          <mat-error>Name is required.</mat-error>
        }
      </mat-form-field>

      @if (duplicateNameError()) {
        <p role="alert">A category with this name already exists.</p>
      }

      <div class="form-actions">
        <button matButton="filled" type="submit">{{ editingId() ? 'Save' : 'Add' }}</button>
        @if (editingId()) {
          <button matButton="text" type="button" (click)="cancelEdit()">Cancel</button>
        }
      </div>
    </form>
  `,
  styles: `
    .category-form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-width: 360px;
    }

    .form-actions {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }

    .row-actions {
      display: flex;
      gap: 4px;
    }
  `,
})
export class CategoriesManager {
  protected readonly categoriesService = inject(CategoriesService);

  protected readonly editingId = signal<CategoryId | null>(null);
  protected readonly duplicateNameError = signal(false);

  private readonly model = signal<CategoryFormValue>({ ...EMPTY_CATEGORY_FORM });
  protected readonly categoryForm = form(this.model, (path) => {
    required(path.name);
  });

  constructor() {
    effect(() => {
      this.categoryForm.name().value();
      this.duplicateNameError.set(false);
    });
  }

  protected startEdit(category: Category): void {
    this.editingId.set(category.id);
    this.model.set({ name: category.name });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.categoryForm().reset({ ...EMPTY_CATEGORY_FORM });
  }

  protected remove(id: CategoryId): void {
    if (confirm('Delete this category?')) {
      this.categoriesService.remove(id);
    }
  }

  protected handleSubmit(event: Event): void {
    event.preventDefault();
    if (this.categoryForm().invalid()) {
      return;
    }

    const value = { ...this.model(), name: this.model().name.trim() };
    if (!value.name) {
      return;
    }

    const editingId = this.editingId();
    const isDuplicate = this.categoriesService
      .categories()
      .some(
        (category) =>
          category.id !== editingId && category.name.toLowerCase() === value.name.toLowerCase(),
      );
    if (isDuplicate) {
      this.duplicateNameError.set(true);
      return;
    }

    if (editingId) {
      this.categoriesService.update(editingId, value);
    } else {
      this.categoriesService.add(value);
    }
    this.cancelEdit();
  }
}
