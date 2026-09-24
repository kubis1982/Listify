import { Component, computed, effect, input, model, output, signal, viewChild } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import {
  MatAutocomplete,
  MatAutocompleteSelectedEvent,
  MatAutocompleteTrigger,
  MatOption,
} from '@angular/material/autocomplete';

const CREATE_OPTION = Symbol('create-text-option');

@Component({
  selector: 'app-creatable-text-picker',
  imports: [MatAutocomplete, MatAutocompleteTrigger, MatOption],
  template: `
    <input
      #inputEl
      type="text"
      class="field-input"
      [id]="inputId()"
      [placeholder]="placeholder()"
      autocomplete="off"
      [value]="queryText()"
      [matAutocomplete]="auto"
      [attr.aria-describedby]="queryText().trim() === '' ? hintId() : null"
      (input)="onQueryInput($event)"
      (blur)="touch.emit()"
    />
    @if (queryText().trim() === '') {
      <span [id]="hintId()" class="creatable-text-picker__hint">{{ hintText() }}</span>
    }
    <mat-autocomplete
      #auto="matAutocomplete"
      [aria-label]="resultsLabel()"
      [displayWith]="displayValue"
      (optionSelected)="onOptionSelected($event)"
    >
      @for (option of filteredOptions(); track option) {
        <mat-option [value]="option">{{ option }}</mat-option>
      } @empty {
        @if (queryText().trim() !== '') {
          <mat-option [value]="createOptionValue">
            <span class="creatable-text-picker__create-option">
              <svg
                class="icon icon--sm"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              {{ createOptionLabel()(queryText().trim()) }}
            </span>
          </mat-option>
        }
      }
    </mat-autocomplete>
  `,
  styles: `
    .creatable-text-picker__hint {
      display: block;
      font-size: 0.7rem;
      color: rgba(20, 32, 29, 0.65);
      margin-top: 0.25rem;
    }

    .creatable-text-picker__create-option {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--color-accent);
      font-weight: 700;
    }
  `,
})
export class CreatableTextPicker implements FormValueControl<string> {
  readonly options = input.required<readonly string[]>();
  readonly inputId = input.required<string>();
  readonly placeholder = input('');
  readonly hintText = input.required<string>();
  readonly resultsLabel = input.required<string>();
  readonly createOptionLabel = input.required<(name: string) => string>();
  readonly onCreate = input.required<(text: string) => string>();
  readonly value = model.required<string>();
  readonly touch = output<void>();
  readonly created = output<void>();

  private readonly autoTrigger = viewChild.required(MatAutocompleteTrigger);

  protected readonly queryText = signal('');
  protected readonly createOptionValue = CREATE_OPTION;
  protected readonly hintId = computed(() => `${this.inputId()}-hint`);

  protected readonly filteredOptions = computed(() => {
    const query = this.queryText().trim().toLowerCase();
    if (!query) {
      return [];
    }
    return this.options().filter((option) => option.toLowerCase().includes(query));
  });

  // Mirrors the transition-tracking effect in ProductPicker: only reacts to an
  // actual `value()` change, not to unrelated re-runs (e.g. `options()`
  // changing while `value()` stays put).
  private previousValue = '';
  private suppressNextQuerySync = false;

  constructor() {
    effect(() => {
      const value = this.value();
      if (value === this.previousValue) {
        return;
      }
      this.previousValue = value;
      if (this.suppressNextQuerySync) {
        this.suppressNextQuerySync = false;
        return;
      }
      this.queryText.set(value);
    });
  }

  protected readonly displayValue = (value: string | typeof CREATE_OPTION): string => {
    if (value === CREATE_OPTION) {
      return this.queryText();
    }
    return value;
  };

  protected onQueryInput(event: Event): void {
    const newText = (event.target as HTMLInputElement).value;
    this.queryText.set(newText);

    const currentValue = this.value();
    if (currentValue && currentValue !== newText) {
      this.suppressNextQuerySync = true;
      this.value.set('');
    }

    if (this.queryText().trim() === '') {
      this.autoTrigger().closePanel();
    } else {
      this.autoTrigger().openPanel();
    }
  }

  protected onOptionSelected(event: MatAutocompleteSelectedEvent): void {
    const selected = event.option.value as string | typeof CREATE_OPTION;
    if (selected === CREATE_OPTION) {
      const created = this.onCreate()(this.queryText().trim());
      this.value.set(created);
      this.queryText.set(created);
      this.created.emit();
      return;
    }
    this.value.set(selected);
  }
}
