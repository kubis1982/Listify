import { Dialog } from '@angular/cdk/dialog';
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import {
  MatAutocomplete,
  MatAutocompleteSelectedEvent,
  MatAutocompleteTrigger,
  MatOption,
} from '@angular/material/autocomplete';
import { firstValueFrom } from 'rxjs';
import {
  CreateProductDialog,
  CreateProductDialogData,
} from '../../features/products/create-product-dialog/create-product-dialog';
import { Product, ProductId } from '../../features/products/data/product.model';

const CREATE_OPTION = Symbol('create-product-option');

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
      [value]="queryText()"
      [matAutocomplete]="auto"
      (input)="onQueryInput($event)"
      (blur)="touch.emit()"
    />
    @if (queryText().trim() === '') {
      <span class="product-picker__hint">Start typing to search products.</span>
    }
    <mat-autocomplete
      #auto="matAutocomplete"
      [displayWith]="displayProduct"
      (optionSelected)="onOptionSelected($event)"
    >
      @for (product of filteredProducts(); track product.id) {
        <mat-option [value]="product.id">{{ product.name }}</mat-option>
      } @empty {
        @if (queryText().trim() !== '') {
          <mat-option [value]="createOptionValue">
            Create product "{{ queryText().trim() }}"
          </mat-option>
        }
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
export class ProductPicker implements FormValueControl<ProductId> {
  readonly products = input.required<readonly Product[]>();
  readonly inputId = input.required<string>();
  readonly value = model.required<ProductId>();
  readonly touch = output<void>();

  private readonly dialog = inject(Dialog);
  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('inputEl');
  private readonly autoTrigger = viewChild.required(MatAutocompleteTrigger);

  protected readonly queryText = signal('');
  protected readonly createOptionValue = CREATE_OPTION;

  protected readonly filteredProducts = computed(() => {
    const query = this.queryText().trim().toLowerCase();
    if (!query) {
      return [];
    }
    return this.products().filter((product) => product.name.toLowerCase().includes(query));
  });

  constructor() {
    // Keeps the displayed text in sync when `value` changes from outside this
    // component (e.g. a bound Signal Forms field initialized from an existing
    // shopping-list item). When `value` refers to a product this component was
    // never told about via `products()` — notably one just created through the
    // dialog in `onOptionSelected`, which sets the display text itself — this
    // deliberately leaves the existing display text alone instead of clearing it.
    effect(() => {
      const id = this.value();
      if (!id) {
        this.queryText.set('');
        return;
      }
      const selected = this.products().find((product) => product.id === id);
      if (selected) {
        this.queryText.set(selected.name);
      }
    });
  }

  focus(options?: FocusOptions): void {
    this.inputRef().nativeElement.focus(options);
  }

  protected readonly displayProduct = (value: ProductId | typeof CREATE_OPTION): string => {
    if (value === CREATE_OPTION) {
      // The trigger writes this display value straight into the native input on
      // selection; keep it a no-op for the create option so it never overwrites
      // the query text the user typed with something unrelated.
      return this.queryText();
    }
    return this.products().find((product) => product.id === value)?.name ?? '';
  };

  protected onQueryInput(event: Event): void {
    this.queryText.set((event.target as HTMLInputElement).value);
    // MatAutocompleteTrigger only opens the panel from its own native `input`
    // listener when the input already has focus (see `_handleInput` in
    // @angular/material/fesm2022/autocomplete.mjs). Driving the panel
    // explicitly keeps this control's behavior independent of DOM focus state.
    if (this.queryText().trim() === '') {
      this.autoTrigger().closePanel();
    } else {
      this.autoTrigger().openPanel();
    }
  }

  protected async onOptionSelected(event: MatAutocompleteSelectedEvent): Promise<void> {
    const selected = event.option.value as ProductId | typeof CREATE_OPTION;
    if (selected === CREATE_OPTION) {
      const created = await this.openCreateDialog(this.queryText().trim());
      if (created) {
        this.value.set(created.id);
        this.queryText.set(created.name);
      }
      return;
    }
    this.value.set(selected);
  }

  private openCreateDialog(initialName: string): Promise<Product | undefined> {
    const dialogRef = this.dialog.open<Product | undefined, CreateProductDialogData>(
      CreateProductDialog,
      { data: { initialName } },
    );
    return firstValueFrom(dialogRef.closed);
  }
}
