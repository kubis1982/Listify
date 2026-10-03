import { Component, inject, input, resource, signal } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n.service';
import { TranslationKey } from '../../../core/i18n/translations/en';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { ShoppingListSharingService } from '../data/shopping-list-sharing.service';

@Component({
  selector: 'app-invite-link-panel',
  template: `
    <section class="share-section" aria-labelledby="invite-link-heading">
      <h3 id="invite-link-heading">{{ t('share.linkHeading') }}</h3>
      <p class="share-section__hint">{{ t('share.linkHint') }}</p>
      <label class="field-label" for="invite-link">{{ t('share.linkLabel') }}</label>
      <input id="invite-link" type="text" class="field-input" readonly [value]="link.value() ?? ''" />
      <div class="form-actions">
        <button type="button" class="btn-outline-pill" [disabled]="!link.value()" (click)="copy()">
          {{ t('share.copy') }}
        </button>
        @if (canNativeShare) {
          <button type="button" class="btn-outline-pill" [disabled]="!link.value()" (click)="send()">
            {{ t('share.send') }}
          </button>
        }
        <button type="button" class="btn-outline-pill" [disabled]="!link.value()" (click)="regenerate()">
          {{ t('share.regenerate') }}
        </button>
      </div>
      <p class="field-info" aria-live="polite">
        @if (statusKey(); as key) {
          {{ t(key) }}
        }
      </p>
    </section>
  `,
  styles: `
    .share-section h3 {
      margin: 0 0 0.25rem;
      font-size: 1rem;
    }

    .share-section__hint {
      margin: 0 0 0.75rem;
      font-size: 0.875rem;
      color: rgba(20, 32, 29, 0.7);
    }
  `,
})
export class InviteLinkPanel {
  readonly listId = input.required<string>();
  /** Bump to reload the link after it was changed elsewhere (e.g. revoked on member removal). */
  readonly version = input(0);

  private readonly sharingService = inject(ShoppingListSharingService);
  private readonly confirmDialogService = inject(ConfirmDialogService);
  protected readonly t = inject(I18n).t;

  protected readonly canNativeShare = typeof navigator.share === 'function';
  protected readonly statusKey = signal<TranslationKey | null>(null);
  protected readonly link = resource({
    params: () => ({ listId: this.listId(), version: this.version() }),
    loader: ({ params }) => this.sharingService.getInviteLink(params.listId),
  });

  protected async copy(): Promise<void> {
    const link = this.link.value();
    if (!link) {
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      this.statusKey.set('share.copied');
    } catch {
      // No clipboard API or permission denied — the field stays selectable.
      this.statusKey.set('share.copyFailed');
    }
  }

  protected async send(): Promise<void> {
    const link = this.link.value();
    if (!link) {
      return;
    }
    try {
      await navigator.share({ title: this.t('share.sendTitle'), url: link });
    } catch {
      // Cancelled share sheet — the link is still visible to copy.
    }
  }

  protected async regenerate(): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: this.t('share.regenerateTitle'),
      message: this.t('share.regenerateMessage'),
      confirmLabel: this.t('share.regenerateConfirm'),
    });
    if (!confirmed) {
      return;
    }
    const link = await this.sharingService.regenerateInviteLink(this.listId());
    if (link) {
      this.link.set(link);
      this.statusKey.set('share.regenerated');
    }
  }
}
