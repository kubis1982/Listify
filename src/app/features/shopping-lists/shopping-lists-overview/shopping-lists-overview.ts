import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { ShoppingListsService } from '../data/shopping-lists.service';

interface NewListFormValue {
  name: string;
}

@Component({
  selector: 'app-shopping-lists-overview',
  imports: [DatePipe, RouterLink, FormField],
  template: `
    <h1>Shopping lists</h1>

    @if (shoppingListsService.lists().length === 0) {
      <p>No shopping lists yet — create your first one below.</p>
    } @else {
      <ul>
        @for (list of shoppingListsService.lists(); track list.id) {
          <li>
            <a [routerLink]="['/lists', list.id]">{{ list.name }}</a>
            <span>{{ list.createdAt | date: 'medium' }}</span>
            <span>{{ list.status === 'active' ? 'Active' : 'Completed' }}</span>
            <button type="button" (click)="toggleStatus(list.id, list.status)">
              {{ list.status === 'active' ? 'Mark completed' : 'Mark active' }}
            </button>
            <button type="button" (click)="remove(list.id)">Delete</button>
          </li>
        }
      </ul>
    }

    <h2>New shopping list</h2>
    <form (submit)="handleSubmit($event)">
      <label>
        Name
        <input type="text" [formField]="newListForm.name" />
      </label>
      @if (newListForm.name().invalid() && newListForm.name().touched()) {
        <p role="alert">Name is required.</p>
      }
      <button type="submit">Create list</button>
    </form>
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
    this.shoppingListsService.addList(this.model().name);
    this.model.set({ name: '' });
  }
}
