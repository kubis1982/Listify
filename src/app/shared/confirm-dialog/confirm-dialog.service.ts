import { Dialog } from '@angular/cdk/dialog';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialog, ConfirmDialogData } from './confirm-dialog';

@Service()
export class ConfirmDialogService {
  private readonly dialog = inject(Dialog);

  async confirm(data: ConfirmDialogData): Promise<boolean> {
    const dialogRef = this.dialog.open<boolean, ConfirmDialogData>(ConfirmDialog, {
      data,
      role: 'alertdialog',
      autoFocus: '.btn-outline-pill',
    });
    const result = await firstValueFrom(dialogRef.closed);
    return result ?? false;
  }

  async alert(data: { title: string; message: string }): Promise<void> {
    const dialogRef = this.dialog.open<boolean, ConfirmDialogData>(ConfirmDialog, {
      data: { ...data, hideCancel: true, confirmLabel: 'OK' },
      role: 'alertdialog',
      autoFocus: '.btn-accent-pill-lg',
    });
    await firstValueFrom(dialogRef.closed);
  }
}
