import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';

export interface ConfirmDialogData {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly hideCancel?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  template: `
    <div class="add-panel confirm-dialog">
      <div class="add-panel__header">
        <h2>{{ data.title }}</h2>
      </div>
      <p class="confirm-dialog__message">{{ data.message }}</p>
      <div class="confirm-dialog__actions">
        @if (!data.hideCancel) {
          <button type="button" class="btn-outline-pill" (click)="cancel()">
            {{ data.cancelLabel ?? t('common.cancel') }}
          </button>
        }
        <button type="button" class="btn-accent-pill-lg" (click)="confirm()">
          {{ data.confirmLabel ?? t('common.delete') }}
        </button>
      </div>
    </div>
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(DIALOG_DATA);
  protected readonly t = inject(I18n).t;
  private readonly dialogRef = inject<DialogRef<boolean>>(DialogRef);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
