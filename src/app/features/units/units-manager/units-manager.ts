import { Component, effect, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { Unit, UnitId } from '../data/unit.model';
import { UnitsService } from '../data/units.service';

interface UnitFormValue {
  name: string;
  symbol: string;
}

const EMPTY_UNIT_FORM: UnitFormValue = { name: '', symbol: '' };

@Component({
  selector: 'app-units-manager',
  imports: [FormField],
  template: `
    <h1>Units of measure</h1>

    @if (unitsService.units().length === 0) {
      <p>No units yet — add the first one below.</p>
    } @else {
      <ul>
        @for (unit of unitsService.units(); track unit.id) {
          <li>
            <span>{{ unit.name }} ({{ unit.symbol }})</span>
            <button type="button" (click)="startEdit(unit)">Edit</button>
            <button type="button" (click)="remove(unit.id)">Delete</button>
          </li>
        }
      </ul>
    }

    <h2>{{ editingId() ? 'Edit unit' : 'Add unit' }}</h2>
    <form (submit)="handleSubmit($event)">
      <label>
        Name
        <input type="text" [formField]="unitForm.name" />
      </label>
      @if (unitForm.name().invalid() && unitForm.name().touched()) {
        <p role="alert">Name is required.</p>
      }

      <label>
        Symbol
        <input type="text" [formField]="unitForm.symbol" />
      </label>
      @if (unitForm.symbol().invalid() && unitForm.symbol().touched()) {
        <p role="alert">Symbol is required.</p>
      }

      @if (duplicateNameError()) {
        <p role="alert">A unit with this name already exists.</p>
      }

      <button type="submit">{{ editingId() ? 'Save' : 'Add' }}</button>
      @if (editingId()) {
        <button type="button" (click)="cancelEdit()">Cancel</button>
      }
    </form>
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
    this.model.set({ ...EMPTY_UNIT_FORM });
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

    const value = this.model();
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
