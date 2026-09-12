import { Component, effect, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { FabPanel } from '../../../shared/fab-panel/fab-panel';
import { Category, CategoryId } from '../data/category.model';
import { CategoriesService } from '../data/categories.service';

interface CategoryFormValue {
  name: string;
}

const EMPTY_CATEGORY_FORM: CategoryFormValue = { name: '' };

@Component({
  selector: 'app-categories-manager',
  imports: [FormField, FabPanel],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Categories</h1>
      </div>

      @if (categoriesService.categories().length === 0) {
        <p class="empty-state">No categories yet — add the first one using the + button.</p>
      } @else {
        <div class="list-group">
          @for (category of categoriesService.categories(); track category.id) {
            <div class="list-card">
              <div class="list-card__body">
                <span class="list-card__name">{{ category.name }}</span>
              </div>
              <div class="list-card__actions">
                <button
                  type="button"
                  class="icon-btn"
                  (click)="startEdit(category)"
                  [attr.aria-label]="'Edit ' + category.name"
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
                  (click)="remove(category.id)"
                  [attr.aria-label]="'Delete ' + category.name"
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
      [title]="editingId() ? 'Edit category' : 'Add category'"
      fabLabel="Add category"
      [(open)]="isPanelOpen"
    >
      <form novalidate (submit)="handleSubmit($event)">
        <label class="field-label" for="category-name">Name</label>
        <input id="category-name" type="text" class="field-input" [formField]="categoryForm.name" />
        @if (categoryForm.name().invalid() && categoryForm.name().touched()) {
          <span class="field-error">Name is required.</span>
        }

        @if (duplicateNameError()) {
          <p class="field-error" role="alert">A category with this name already exists.</p>
        }

        <button type="submit" class="btn-accent-pill-lg full-width">
          {{ editingId() ? 'Save' : 'Add' }}
        </button>
        @if (editingId()) {
          <button type="button" class="btn-outline-pill full-width" (click)="cancelEdit()">
            Cancel
          </button>
        }
      </form>
    </app-fab-panel>
  `,
})
export class CategoriesManager {
  protected readonly categoriesService = inject(CategoriesService);
  private readonly confirmDialogService = inject(ConfirmDialogService);

  protected readonly editingId = signal<CategoryId | null>(null);
  protected readonly duplicateNameError = signal(false);
  protected readonly isPanelOpen = signal(false);

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
    this.isPanelOpen.set(true);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.categoryForm().reset({ ...EMPTY_CATEGORY_FORM });
    this.isPanelOpen.set(false);
  }

  protected async remove(id: CategoryId): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: 'Delete this category?',
      message: 'This will permanently remove the category.',
    });
    if (confirmed) {
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
