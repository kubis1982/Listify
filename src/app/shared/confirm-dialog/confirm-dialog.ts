import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';

export interface ConfirmDialogData {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  template: `
    <div class="add-panel confirm-dialog">
      <div class="add-panel__header">
        <h2>{{ data.title }}</h2>
        <button type="button" class="icon-btn" (click)="cancel()" aria-label="Close">
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <p class="confirm-dialog__message">{{ data.message }}</p>
      <div class="confirm-dialog__actions">
        <button type="button" class="btn-outline-pill" (click)="cancel()">
          {{ data.cancelLabel ?? 'Cancel' }}
        </button>
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
