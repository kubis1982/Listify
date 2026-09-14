import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';

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
            {{ data.cancelLabel ?? 'Cancel' }}
          </button>
        }
        <button type="button" class="btn-accent-pill-lg" (click)="confirm()">
          {{ data.confirmLabel ?? 'Delete' }}
        </button>
      </div>
    </div>
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject<DialogRef<boolean>>(DialogRef);

  protected confirm(): void {
    this.dialogRef.close(true);
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
