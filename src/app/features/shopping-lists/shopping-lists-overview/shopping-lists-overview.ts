import { DatePipe } from '@angular/common';
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
import { Router, RouterLink } from '@angular/router';
import { I18n } from '../../../core/i18n/i18n.service';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { FabPanel } from '../../../shared/fab-panel/fab-panel';
import { parseShoppingListExport, ShoppingListImportError } from '../data/shopping-list-export';
import { ShoppingList, ShoppingListId } from '../data/shopping-list.model';
import { ShoppingListsService } from '../data/shopping-lists.service';

interface NewListFormValue {
  name: string;
}

@Component({
  selector: 'app-shopping-lists-overview',
  imports: [DatePipe, RouterLink, FormField, FabPanel],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>{{ t('lists.title') }}</h1>
        <button type="button" class="btn-outline-pill" (click)="triggerImport()">
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
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {{ t('lists.import') }}
        </button>
        <input
          #importInput
          type="file"
          accept="text/plain,.txt,application/json,.json"
          hidden
          (change)="handleImportFileSelected($event)"
        />
      </div>

      @if (shoppingListsService.lists().length === 0) {
        <p class="empty-state">{{ t('lists.empty') }}</p>
      } @else {
        @if (activeLists().length > 0) {
          <section class="list-section">
            <div class="section-heading">
              <h2>{{ t('lists.activeSection') }}</h2>
              <span class="section-rule"></span>
            </div>
            <div class="list-group">
              @for (list of activeLists(); track list.id) {
                <div class="list-card">
                  <span class="accent-bar accent-bar--active" aria-hidden="true"></span>
                  <div class="list-card__body">
                    <a class="list-card__name" [routerLink]="['/lists', list.id]">{{ list.name }}</a>
                    <span class="list-card__meta">{{
                      t('lists.added', {
                        date: (list.createdAt | date: 'MMM d, y' : undefined : language()) ?? '',
                      })
                    }}</span>
                  </div>
                  <div class="list-card__actions">
                    <button
                      type="button"
                      class="btn-outline-pill"
                      (click)="toggleStatus(list.id, list.status)"
                      [attr.aria-label]="t('lists.markCompleteFor', { name: list.name })"
                    >
                      <svg
                        class="icon icon--success"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      <span class="btn-outline-pill__label">{{ t('lists.markComplete') }}</span>
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      (click)="startEdit(list)"
                      [attr.aria-label]="t('lists.editFor', { name: list.name })"
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
                      (click)="remove(list.id)"
                      [attr.aria-label]="t('lists.deleteFor', { name: list.name })"
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
          </section>
        }

        @if (completedLists().length > 0) {
          <section class="list-section list-section--completed">
            <div class="section-heading">
              <h2>{{ t('lists.completedSection') }}</h2>
              <span class="section-rule"></span>
            </div>
            <div class="list-group">
              @for (list of completedLists(); track list.id) {
                <div class="list-card">
                  <span class="accent-bar accent-bar--completed" aria-hidden="true"></span>
                  <div class="list-card__body">
                    <a class="list-card__name list-card__name--done" [routerLink]="['/lists', list.id]">{{
                      list.name
                    }}</a>
                    <span class="list-card__meta">{{
                      t('lists.added', {
                        date: (list.createdAt | date: 'MMM d, y' : undefined : language()) ?? '',
                      })
                    }}</span>
                  </div>
                  <div class="list-card__actions">
                    <button
                      type="button"
                      class="btn-outline-pill"
                      (click)="toggleStatus(list.id, list.status)"
                      [attr.aria-label]="t('lists.restoreFor', { name: list.name })"
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
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <polyline points="3 3 3 8 8 8" />
                      </svg>
                      <span class="btn-outline-pill__label">{{ t('lists.restore') }}</span>
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      (click)="startEdit(list)"
                      [attr.aria-label]="t('lists.editFor', { name: list.name })"
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
                      (click)="remove(list.id)"
                      [attr.aria-label]="t('lists.deleteFor', { name: list.name })"
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
          </section>
        }
      }
    </div>

    <app-fab-panel
      [title]="editingId() ? t('lists.panelEdit') : t('lists.panelNew')"
      [fabLabel]="t('lists.fabLabel')"
      [(open)]="isPanelOpen"
      (cancelled)="cancelEdit()"
    >
      <form novalidate (submit)="handleSubmit($event)">
        <label class="field-label" for="new-list-name">{{ t('common.name') }}</label>
        <input
          #nameInput
          id="new-list-name"
          type="text"
          class="field-input"
          [formField]="newListForm.name"
        />
        @if (newListForm.name().invalid() && newListForm.name().touched()) {
          <span class="field-error">{{ t('common.nameRequired') }}</span>
        }
        <div class="form-actions">
          <button type="button" class="btn-outline-pill" (click)="cancelEdit()">
            {{ t('common.cancel') }}
          </button>
          <button type="submit" class="btn-accent-pill-lg">
            {{ editingId() ? t('common.save') : t('lists.create') }}
          </button>
        </div>
      </form>
    </app-fab-panel>
  `,
  styles: `
    .list-section {
      margin-bottom: 3rem;

      &:last-child {
        margin-bottom: 0;
      }
    }

    .list-section--completed .list-group {
      opacity: 0.75;
    }
  `,
})
export class ShoppingListsOverview {
  protected readonly shoppingListsService = inject(ShoppingListsService);
  private readonly confirmDialogService = inject(ConfirmDialogService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly language = this.i18n.language;

  protected readonly activeLists = computed(() =>
    this.shoppingListsService
      .lists()
      .filter((list) => list.status === 'active')
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  protected readonly completedLists = computed(() =>
    this.shoppingListsService
      .lists()
      .filter((list) => list.status === 'completed')
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  protected readonly editingId = signal<ShoppingListId | null>(null);
  protected readonly isPanelOpen = signal(false);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly importInput = viewChild<ElementRef<HTMLInputElement>>('importInput');

  private readonly model = signal<NewListFormValue>({ name: '' });
  protected readonly newListForm = form(this.model, (path) => {
    required(path.name);
  });

  constructor() {
    afterRenderEffect(() => {
      if (this.isPanelOpen()) {
        this.nameInput()?.nativeElement.focus();
      }
    });

    effect(() => {
      if (!this.isPanelOpen()) {
        this.editingId.set(null);
        this.newListForm().reset({ name: '' });
      }
    });
  }

  protected toggleStatus(id: ShoppingListId, status: ShoppingList['status']): void {
    this.shoppingListsService.setStatus(id, status === 'active' ? 'completed' : 'active');
  }

  protected startEdit(list: ShoppingList): void {
    this.editingId.set(list.id);
    this.model.set({ name: list.name });
    this.isPanelOpen.set(true);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.newListForm().reset({ name: '' });
    this.isPanelOpen.set(false);
  }

  protected async remove(id: ShoppingListId): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: this.t('lists.deleteTitle'),
      message: this.t('lists.deleteMessage'),
    });
    if (confirmed) {
      this.shoppingListsService.removeList(id);
    }
  }

  protected handleSubmit(event: Event): void {
    event.preventDefault();
    if (this.newListForm().invalid()) {
      return;
    }
    const name = this.model().name.trim();
    if (!name) {
      return;
    }

    const editingId = this.editingId();
    if (editingId) {
      this.shoppingListsService.rename(editingId, name);
      this.cancelEdit();
      return;
    }

    const list = this.shoppingListsService.addList(name);
    this.newListForm().reset({ name: '' });
    this.router.navigate(['/lists', list.id]);
  }

  protected triggerImport(): void {
    this.importInput()?.nativeElement.click();
  }

  protected async handleImportFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseShoppingListExport(text);
      const list = this.shoppingListsService.importList(parsed.list);
      this.router.navigate(['/lists', list.id]);
    } catch (error) {
      if (error instanceof ShoppingListImportError) {
        await this.confirmDialogService.alert({
          title: this.t('lists.importFailedTitle'),
          message: this.t('lists.importFailedMessage'),
        });
      }
    }
  }
}
