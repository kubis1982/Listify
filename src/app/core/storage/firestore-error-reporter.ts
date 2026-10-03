import { inject, Service } from '@angular/core';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { I18n } from '../i18n/i18n.service';

/** Logs a Firestore failure and shows the generic "Save failed" alert. */
@Service()
export class FirestoreErrorReporter {
  private readonly confirmDialogService = inject(ConfirmDialogService);
  private readonly t = inject(I18n).t;

  report(error?: unknown): void {
    if (error !== undefined) {
      console.error('[Firestore]', error);
    }
    void this.confirmDialogService.alert({
      title: this.t('errors.saveFailedTitle'),
      message: this.t('errors.saveFailedMessage'),
    });
  }
}
