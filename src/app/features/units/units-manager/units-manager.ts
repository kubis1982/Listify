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
import { I18n } from '../../../core/i18n/i18n.service';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { FabPanel } from '../../../shared/fab-panel/fab-panel';
import { ProductsService } from '../../products/data/products.service';
import { Unit, UnitId } from '../data/unit.model';
import { UnitsService } from '../data/units.service';

interface UnitFormValue {
  symbol: string;
}

const EMPTY_UNIT_FORM: UnitFormValue = { symbol: '' };

@Component({
  selector: 'app-units-manager',
  imports: [FormField, FabPanel],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>{{ t('units.title') }}</h1>
      </div>

      @if (unitsService.units().length === 0) {
        <p class="empty-state">{{ t('units.empty') }}</p>
      } @else {
        <div class="list-group">
          @for (unit of sortedUnits(); track unit.id) {
            <div class="list-card">
              <div class="list-card__body">
                <span class="list-card__name">{{ unit.symbol }}</span>
              </div>
              <div class="list-card__actions">
                <button
                  type="button"
                  class="icon-btn"
                  [class.icon-btn--default]="unit.isDefault"
                  (click)="setDefault(unit.id)"
                  [disabled]="unit.isDefault"
                  [attr.aria-label]="
                    unit.isDefault
                      ? t('units.alreadyDefault', { name: unit.symbol })
                      : t('units.setDefault', { name: unit.symbol })
                  "
                  [attr.title]="unit.isDefault ? null : t('units.setDefaultTitle')"
                >
                  <svg
                    class="icon"
                    viewBox="0 0 24 24"
                    [attr.fill]="unit.isDefault ? 'currentColor' : 'none'"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <polygon
                      points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  class="icon-btn"
                  (click)="startEdit(unit)"
                  [disabled]="usedUnitIds().has(unit.id)"
                  [attr.aria-label]="
                    usedUnitIds().has(unit.id)
                      ? t('units.cannotEditFor', { name: unit.symbol })
                      : t('units.editFor', { name: unit.symbol })
                  "
                  [attr.title]="
                    usedUnitIds().has(unit.id) ? t('units.cannotEdit') : null
                  "
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
                  [disabled]="usedUnitIds().has(unit.id)"
                  [attr.aria-label]="
                    usedUnitIds().has(unit.id)
                      ? t('units.cannotDeleteFor', { name: unit.symbol })
                      : t('units.deleteFor', { name: unit.symbol })
                  "
                  [attr.title]="
                    usedUnitIds().has(unit.id) ? t('units.cannotDelete') : null
                  "
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
      [title]="editingId() ? t('units.panelEdit') : t('units.panelAdd')"
      [fabLabel]="t('units.panelAdd')"
      [(open)]="isPanelOpen"
      (cancelled)="cancelEdit()"
    >
      <form novalidate (submit)="handleSubmit($event)">
        <label class="field-label" for="unit-symbol">{{ t('units.symbol') }}</label>
        <input
          #symbolInput
          id="unit-symbol"
          type="text"
          class="field-input"
          [formField]="unitForm.symbol"
        />
        @if (unitForm.symbol().invalid() && unitForm.symbol().touched()) {
          <span class="field-error">{{ t('units.symbolRequired') }}</span>
        }

        @if (duplicateSymbolError()) {
          <p class="field-error" role="alert">{{ t('units.duplicate') }}</p>
        }

        <div class="form-actions">
          <button type="button" class="btn-outline-pill" (click)="cancelEdit()">{{ t('common.cancel') }}</button>
          <button type="submit" class="btn-accent-pill-lg">
            {{ editingId() ? t('common.save') : t('common.add') }}
          </button>
        </div>
      </form>
    </app-fab-panel>
  `,
})
export class UnitsManager {
  protected readonly unitsService = inject(UnitsService);
  private readonly confirmDialogService = inject(ConfirmDialogService);
  private readonly productsService = inject(ProductsService);
  protected readonly t = inject(I18n).t;

  protected readonly editingId = signal<UnitId | null>(null);
  protected readonly duplicateSymbolError = signal(false);
  protected readonly isPanelOpen = signal(false);

  protected readonly sortedUnits = computed(() =>
    [...this.unitsService.units()].sort((a, b) => a.symbol.localeCompare(b.symbol)),
  );

  protected readonly usedUnitIds = computed(
    () => new Set(this.productsService.products().map((product) => product.defaultUnitId)),
  );

  private readonly symbolInput = viewChild<ElementRef<HTMLInputElement>>('symbolInput');

  private readonly model = signal<UnitFormValue>({ ...EMPTY_UNIT_FORM });
  protected readonly unitForm = form(this.model, (path) => {
    required(path.symbol);
  });

  constructor() {
    effect(() => {
      this.unitForm.symbol().value();
      this.duplicateSymbolError.set(false);
    });

    effect(() => {
      if (!this.isPanelOpen()) {
        this.editingId.set(null);
        this.unitForm().reset({ ...EMPTY_UNIT_FORM });
      }
    });

    afterRenderEffect(() => {
      if (this.isPanelOpen()) {
        this.symbolInput()?.nativeElement.focus();
      }
    });
  }

  protected startEdit(unit: Unit): void {
    this.editingId.set(unit.id);
    this.model.set({ symbol: unit.symbol });
    this.isPanelOpen.set(true);
  }

  protected setDefault(id: UnitId): void {
    this.unitsService.update(id, { isDefault: true });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.unitForm().reset({ ...EMPTY_UNIT_FORM });
    this.isPanelOpen.set(false);
  }

  protected async remove(id: UnitId): Promise<void> {
    if (this.usedUnitIds().has(id)) {
      return;
    }

    const confirmed = await this.confirmDialogService.confirm({
      title: this.t('units.deleteTitle'),
      message: this.t('units.deleteMessage'),
    });
    if (confirmed) {
      this.unitsService.remove(id);
    }
  }

  protected handleSubmit(event: Event): void {
    event.preventDefault();
    if (this.unitForm().invalid()) {
      return;
    }

    const value = {
      ...this.model(),
      symbol: this.model().symbol.trim(),
    };
    if (!value.symbol) {
      return;
    }

    const editingId = this.editingId();
    const isDuplicate = this.unitsService
      .units()
      .some(
        (unit) =>
          unit.id !== editingId && unit.symbol.toLowerCase() === value.symbol.toLowerCase(),
      );
    if (isDuplicate) {
      this.duplicateSymbolError.set(true);
      return;
    }

    if (editingId) {
      this.unitsService.update(editingId, value);
      this.cancelEdit();
    } else {
      this.unitsService.add(value);
      this.unitForm().reset({ ...EMPTY_UNIT_FORM });
      this.symbolInput()?.nativeElement.focus();
    }
  }
}
