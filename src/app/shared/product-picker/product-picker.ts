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
import { I18n } from '../../core/i18n/i18n.service';
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
      [attr.aria-describedby]="queryText().trim() === '' ? hintId() : null"
      (input)="onQueryInput($event)"
      (blur)="touch.emit()"
    />
    @if (queryText().trim() === '') {
      <span [id]="hintId()" class="product-picker__hint">{{ t('picker.hint') }}</span>
    }
    <mat-autocomplete
      #auto="matAutocomplete"
      [attr.aria-label]="t('picker.results')"
      [displayWith]="displayProduct"
      (optionSelected)="onOptionSelected($event)"
    >
      @for (product of filteredProducts(); track product.id) {
        <mat-option [value]="product.id">{{ product.name }}</mat-option>
      } @empty {
        @if (queryText().trim() !== '') {
          <mat-option [value]="createOptionValue">
            <span class="product-picker__create-option">
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
              {{ t('picker.createOption', { name: queryText().trim() }) }}
            </span>
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

    /* Marks the "create a new product" row as an action rather than a
       search result, echoing the accent weight .btn-accent-pill-lg uses
       for the app's other primary actions. */
    .product-picker__create-option {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--color-accent);
      font-weight: 700;
    }
  `,
})
export class ProductPicker implements FormValueControl<ProductId> {
  readonly products = input.required<readonly Product[]>();
  readonly inputId = input.required<string>();
  readonly value = model.required<ProductId>();
  readonly touch = output<void>();

  private readonly dialog = inject(Dialog);
  protected readonly t = inject(I18n).t;
  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('inputEl');
  private readonly autoTrigger = viewChild.required(MatAutocompleteTrigger);

  protected readonly queryText = signal('');
  protected readonly createOptionValue = CREATE_OPTION;
  protected readonly hintId = computed(() => `${this.inputId()}-hint`);

  protected readonly filteredProducts = computed(() => {
    const query = this.queryText().trim().toLowerCase();
    if (!query) {
      return [];
    }
    return this.products().filter((product) => product.name.toLowerCase().includes(query));
  });

  // Tracks the last `value()` this effect reacted to, so it only runs its sync
  // logic on an actual selection transition — not on every unrelated change to
  // `products()` while `value()` stays put. See the constructor effect below.
  private previousValueId: ProductId | '' = '';
  // Set immediately before an internal `value.set('')` call caused by the user
  // editing the query away from their current selection (see `onQueryInput`).
  // Consumed by the very next effect run so that specific transition doesn't
  // clear `queryText` out from under the text the user is actively typing.
  private suppressNextQuerySync = false;

  constructor() {
    // Keeps the displayed text in sync when `value` changes from outside this
    // component (e.g. a bound Signal Forms field initialized from an existing
    // shopping-list item, or a form reset). When `value` refers to a product
    // this component was never told about via `products()` — notably one just
    // created through the dialog in `onOptionSelected`, which sets the display
    // text itself — this deliberately leaves the existing display text alone
    // instead of clearing it.
    effect(() => {
      const id = this.value();
      if (id === this.previousValueId) {
        // No real transition (e.g. `products()` changed for an unrelated
        // reason); don't touch `queryText`. Returning before reading
        // `products()` also keeps this effect from re-running on further
        // unrelated `products()` changes until `value()` changes again.
        return;
      }
      this.previousValueId = id;
      if (this.suppressNextQuerySync) {
        this.suppressNextQuerySync = false;
        return;
      }
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

  // Called by the parent after it resets the bound form field back to an
  // empty value. When the user typed a query without ever completing a
  // selection, `value` was already `''` (or was cleared as they typed — see
  // `onQueryInput`), so the form reset doesn't produce a `value()` transition
  // and the sync effect above never fires to clear the stale `queryText`.
  resetQuery(): void {
    this.queryText.set('');
    this.previousValueId = this.value();
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
    const newText = (event.target as HTMLInputElement).value;
    this.queryText.set(newText);

    // If the user edits the text away from the product `value` currently
    // points to (without picking a new option), that selection is stale —
    // clear it so a submit can't silently use a product the input no longer
    // displays. `suppressNextQuerySync` stops the sync effect from reacting
    // to this particular `value.set('')` by wiping the text just typed.
    const currentValue = this.value();
    if (currentValue) {
      const selectedName = this.products().find(
        (product) => product.id === currentValue,
      )?.name;
      if (selectedName !== newText) {
        this.suppressNextQuerySync = true;
        this.value.set('');
      }
    }

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
      // CDK Dialog's `restoreFocus` can't be relied on here: opening the
      // dialog happens synchronously inside the autocomplete's
      // `optionSelected` handler, which itself runs *before*
      // `MatAutocompleteTrigger` focuses this input back
      // (see `_setValueAndClose` in @angular/material/autocomplete). By the
      // time `Dialog.open()` captures "the element to restore focus to", it's
      // the clicked `mat-option`, not this input — and that option is gone
      // once the panel closes, so nothing ends up focused. Explicitly
      // refocus the input ourselves on both outcomes to satisfy the spec
      // ("focus returns to the search input").
      this.inputRef().nativeElement.focus();
      return;
    }
    this.value.set(selected);
  }

  private openCreateDialog(initialName: string): Promise<Product | undefined> {
    const dialogRef = this.dialog.open<Product | undefined, CreateProductDialogData>(
      CreateProductDialog,
      { data: { initialName }, ariaLabel: this.t('productDialog.title') },
    );
    return firstValueFrom(dialogRef.closed);
  }
}
