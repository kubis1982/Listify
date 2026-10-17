import {
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import {
  MatAutocomplete,
  MatAutocompleteSelectedEvent,
  MatAutocompleteTrigger,
  MatOption,
} from '@angular/material/autocomplete';
import { I18n } from '../../core/i18n/i18n.service';
import { Product } from '../../features/products/data/product.model';

/**
 * Free-text product name field that suggests registered products as you type.
 * Its value is the typed name, so it can hold either an existing product's
 * name (picked or typed) or a brand-new one — the consumer decides which by
 * matching the name against its products.
 */
@Component({
  selector: 'app-product-picker',
  imports: [MatAutocomplete, MatAutocompleteTrigger, MatOption],
  template: `
    <input
      #inputEl
      type="text"
      class="field-input"
      [id]="inputId()"
      autocomplete="off"
      [value]="value()"
      [matAutocomplete]="auto"
      [attr.aria-describedby]="value().trim() === '' ? hintId() : null"
      (input)="onQueryInput($event)"
      (blur)="touch.emit()"
    />
    @if (value().trim() === '') {
      <span [id]="hintId()" class="product-picker__hint">{{ t('picker.hint') }}</span>
    }
    <mat-autocomplete
      #auto="matAutocomplete"
      [aria-label]="t('picker.results')"
      (optionSelected)="onOptionSelected($event)"
    >
      @for (product of filteredProducts(); track product.id) {
        <mat-option [value]="product.name">{{ product.name }}</mat-option>
      }
    </mat-autocomplete>
  `,
  styles: `
    .product-picker__hint {
      display: block;
      font-size: 0.7rem;
      color: rgba(20, 32, 29, 0.65);
      margin-top: 0.25rem;
    }
  `,
})
export class ProductPicker implements FormValueControl<string> {
  readonly products = input.required<readonly Product[]>();
  readonly inputId = input.required<string>();
  readonly value = model.required<string>();
  readonly touch = output<void>();
  /** Emitted after the user picks a suggested product from the list. */
  readonly productSelected = output<void>();

  protected readonly t = inject(I18n).t;
  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('inputEl');
  private readonly autoTrigger = viewChild.required(MatAutocompleteTrigger);

  protected readonly hintId = computed(() => `${this.inputId()}-hint`);

  protected readonly filteredProducts = computed(() => {
    const query = this.value().trim().toLowerCase();
    if (!query) {
      return [];
    }
    return this.products().filter((product) => product.name.toLowerCase().includes(query));
  });

  focus(options?: FocusOptions): void {
    this.inputRef().nativeElement.focus(options);
  }

  protected onQueryInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);

    // MatAutocompleteTrigger only opens the panel from its own native `input`
    // listener when the input already has focus (see `_handleInput` in
    // @angular/material/fesm2022/autocomplete.mjs). Driving the panel
    // explicitly keeps this control's behavior independent of DOM focus state.
    if (this.value().trim() === '') {
      this.autoTrigger().closePanel();
    } else {
      this.autoTrigger().openPanel();
    }
  }

  protected onOptionSelected(event: MatAutocompleteSelectedEvent): void {
    this.value.set(event.option.value as string);
    this.productSelected.emit();
  }
}
