import { Component, effect, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { Unit, UnitId } from '../data/unit.model';
import { UnitsService } from '../data/units.service';

interface UnitFormValue {
  name: string;
  symbol: string;
}

const EMPTY_UNIT_FORM: UnitFormValue = { name: '', symbol: '' };

@Component({
  selector: 'app-units-manager',
  imports: [FormField, MatButtonModule, MatFormFieldModule, MatInputModule, MatListModule],
  template: `
    <h1>Units of measure</h1>

    @if (unitsService.units().length === 0) {
      <p>No units yet — add the first one below.</p>
    } @else {
      <mat-list>
        @for (unit of unitsService.units(); track unit.id) {
          <mat-list-item>
            <span matListItemTitle>{{ unit.name }} ({{ unit.symbol }})</span>
            <span matListItemMeta class="row-actions">
              <button matButton="text" type="button" (click)="startEdit(unit)">Edit</button>
              <button matButton="text" type="button" (click)="remove(unit.id)">Delete</button>
            </span>
          </mat-list-item>
        }
      </mat-list>
    }

    <h2>{{ editingId() ? 'Edit unit' : 'Add unit' }}</h2>
    <form class="unit-form" (submit)="handleSubmit($event)">
      <mat-form-field appearance="outline">
        <mat-label>Name</mat-label>
        <input matInput type="text" [formField]="unitForm.name" />
        @if (unitForm.name().invalid() && unitForm.name().touched()) {
          <mat-error>Name is required.</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Symbol</mat-label>
        <input matInput type="text" [formField]="unitForm.symbol" />
        @if (unitForm.symbol().invalid() && unitForm.symbol().touched()) {
          <mat-error>Symbol is required.</mat-error>
        }
      </mat-form-field>

      @if (duplicateNameError()) {
        <p role="alert">A unit with this name already exists.</p>
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
    .unit-form {
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
export class UnitsManager {
  protected readonly unitsService = inject(UnitsService);

  protected readonly editingId = signal<UnitId | null>(null);
  protected readonly duplicateNameError = signal(false);

  private readonly model = signal<UnitFormValue>({ ...EMPTY_UNIT_FORM });
  protected readonly unitForm = form(this.model, (path) => {
    required(path.name);
    required(path.symbol);
  });

  constructor() {
    effect(() => {
      this.unitForm.name().value();
      this.duplicateNameError.set(false);
    });
  }

  protected startEdit(unit: Unit): void {
    this.editingId.set(unit.id);
    this.model.set({ name: unit.name, symbol: unit.symbol });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.unitForm().reset({ ...EMPTY_UNIT_FORM });
  }

  protected remove(id: UnitId): void {
    if (confirm('Delete this unit?')) {
      this.unitsService.remove(id);
    }
  }

  protected handleSubmit(event: Event): void {
    event.preventDefault();
    if (this.unitForm().invalid()) {
      return;
    }

    const value = { ...this.model(), name: this.model().name.trim() };
    if (!value.name) {
      return;
    }

    const editingId = this.editingId();
    const isDuplicate = this.unitsService
      .units()
      .some(
        (unit) => unit.id !== editingId && unit.name.toLowerCase() === value.name.toLowerCase(),
      );
    if (isDuplicate) {
      this.duplicateNameError.set(true);
      return;
    }

    if (editingId) {
      this.unitsService.update(editingId, value);
    } else {
      this.unitsService.add(value);
    }
    this.cancelEdit();
  }
}
