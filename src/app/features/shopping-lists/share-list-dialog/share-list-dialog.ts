import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '../../../core/i18n/i18n.service';
import { ShoppingListsService } from '../data/shopping-lists.service';
import { InviteLinkPanel } from './invite-link-panel';
import { MembersPanel } from './members-panel';

export interface ShareListDialogData {
  readonly listId: string;
}

@Component({
  selector: 'app-share-list-dialog',
  imports: [InviteLinkPanel, MembersPanel],
  template: `
    <div class="add-panel share-dialog">
      <div class="add-panel__header">
        <h2 id="share-dialog-title">{{ t('share.title', { name: list()?.name ?? '' }) }}</h2>
        <button type="button" class="icon-btn" (click)="close()" [attr.aria-label]="t('share.close')">
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
      @if (list(); as current) {
        @if (isOwner()) {
          <app-invite-link-panel [listId]="current.id" [version]="linkVersion()" />
        }
        <app-members-panel
          [list]="current"
          [canManage]="isOwner()"
          (left)="onLeft()"
          (linkRevoked)="linkVersion.update((version) => version + 1)"
        />
      }
    </div>
  `,
  styles: `
    .share-dialog {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      max-width: 32rem;
    }
  `,
})
export class ShareListDialog {
  private readonly data = inject<ShareListDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef);
  private readonly router = inject(Router);
  private readonly shoppingListsService = inject(ShoppingListsService);
  protected readonly t = inject(I18n).t;

  protected readonly list = computed(() =>
    this.shoppingListsService.lists().find((list) => list.id === this.data.listId),
  );
  protected readonly isOwner = computed(() => {
    const list = this.list();
    return !!list && this.shoppingListsService.isOwner(list);
  });
  protected readonly linkVersion = signal(0);

  protected close(): void {
    this.dialogRef.close();
  }

  protected onLeft(): void {
    this.dialogRef.close();
    void this.router.navigate(['/lists']);
  }
}
