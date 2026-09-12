import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { ShoppingListsService } from '../data/shopping-lists.service';

interface NewListFormValue {
  name: string;
}

@Component({
  selector: 'app-shopping-lists-overview',
  imports: [
    DatePipe,
    RouterLink,
    FormField,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
  ],
  template: `
    <h1>Shopping lists</h1>

    @if (shoppingListsService.lists().length === 0) {
      <p>No shopping lists yet — create your first one below.</p>
    } @else {
      <mat-list>
        @for (list of shoppingListsService.lists(); track list.id) {
          <mat-list-item>
            <span matListItemTitle
              ><a [routerLink]="['/lists', list.id]">{{ list.name }}</a></span
            >
            <span matListItemLine>{{ list.createdAt | date: 'medium' }}</span>
            <span matListItemMeta class="row-actions">
              <mat-chip-set>
                <mat-chip>{{ list.status === 'active' ? 'Active' : 'Completed' }}</mat-chip>
              </mat-chip-set>
              <button matButton="text" type="button" (click)="toggleStatus(list.id, list.status)">
                {{ list.status === 'active' ? 'Mark completed' : 'Mark active' }}
              </button>
              <button matButton="text" type="button" (click)="remove(list.id)">Delete</button>
            </span>
          </mat-list-item>
        }
      </mat-list>
    }

    <h2>New shopping list</h2>
    <form class="new-list-form" (submit)="handleSubmit($event)">
      <mat-form-field appearance="outline">
        <mat-label>Name</mat-label>
        <input matInput type="text" [formField]="newListForm.name" />
        @if (newListForm.name().invalid() && newListForm.name().touched()) {
          <mat-error>Name is required.</mat-error>
        }
      </mat-form-field>
      <button matButton="filled" type="submit">Create list</button>
    </form>
  `,
  styles: `
    .new-list-form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-width: 360px;
    }

    .row-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
  `,
})
export class ShoppingListsOverview {
  protected readonly shoppingListsService = inject(ShoppingListsService);

  private readonly model = signal<NewListFormValue>({ name: '' });
  protected readonly newListForm = form(this.model, (path) => {
    required(path.name);
  });

  protected toggleStatus(id: string, status: 'active' | 'completed'): void {
    this.shoppingListsService.setStatus(id, status === 'active' ? 'completed' : 'active');
  }

  protected remove(id: string): void {
    if (confirm('Delete this shopping list?')) {
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
    this.shoppingListsService.addList(name);
    this.newListForm().reset({ name: '' });
  }
}
