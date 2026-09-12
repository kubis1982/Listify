import { Component, effect, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { FabPanel } from '../../../shared/fab-panel/fab-panel';
import { Unit, UnitId } from '../data/unit.model';
import { UnitsService } from '../data/units.service';

interface UnitFormValue {
  name: string;
  symbol: string;
}

const EMPTY_UNIT_FORM: UnitFormValue = { name: '', symbol: '' };

@Component({
  selector: 'app-units-manager',
  imports: [FormField, FabPanel],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Units of measure</h1>
      </div>

      @if (unitsService.units().length === 0) {
        <p class="empty-state">No units yet — add the first one using the + button.</p>
      } @else {
        <div class="list-group">
          @for (unit of unitsService.units(); track unit.id) {
            <div class="list-card">
              <div class="list-card__body">
                <span class="list-card__name">{{ unit.name }} ({{ unit.symbol }})</span>
              </div>
              <div class="list-card__actions">
                <button
                  type="button"
                  class="icon-btn"
                  (click)="startEdit(unit)"
                  [attr.aria-label]="'Edit ' + unit.name"
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
                  (click)="remove(unit.id)"
                  [attr.aria-label]="'Delete ' + unit.name"
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
      [title]="editingId() ? 'Edit unit' : 'Add unit'"
      fabLabel="Add unit"
      [(open)]="isPanelOpen"
    >
      <form novalidate (submit)="handleSubmit($event)">
        <label class="field-label" for="unit-name">Name</label>
        <input id="unit-name" type="text" class="field-input" [formField]="unitForm.name" />
        @if (unitForm.name().invalid() && unitForm.name().touched()) {
          <span class="field-error">Name is required.</span>
        }

        <label class="field-label" for="unit-symbol">Symbol</label>
        <input id="unit-symbol" type="text" class="field-input" [formField]="unitForm.symbol" />
        @if (unitForm.symbol().invalid() && unitForm.symbol().touched()) {
          <span class="field-error">Symbol is required.</span>
        }

        @if (duplicateNameError()) {
          <p class="field-error" role="alert">A unit with this name already exists.</p>
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
export class UnitsManager {
  protected readonly unitsService = inject(UnitsService);

  protected readonly editingId = signal<UnitId | null>(null);
  protected readonly duplicateNameError = signal(false);
  protected readonly isPanelOpen = signal(false);

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
    this.isPanelOpen.set(true);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.unitForm().reset({ ...EMPTY_UNIT_FORM });
    this.isPanelOpen.set(false);
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
