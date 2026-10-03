import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
} from '@angular/core';
import { I18n } from '../../../core/i18n/i18n.service';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { ShoppingListSharingService } from '../data/shopping-list-sharing.service';
import { ShoppingList } from '../data/shopping-list.model';

interface MemberView {
  readonly uid: string;
  readonly name: string;
  readonly isOwner: boolean;
}

@Component({
  selector: 'app-members-panel',
  template: `
    <section class="share-section" aria-labelledby="members-heading">
      <h3 id="members-heading" tabindex="-1">{{ t('share.membersHeading') }}</h3>
      <ul class="members">
        @for (member of members(); track member.uid) {
          <li class="members__item" [attr.data-member-uid]="member.uid">
            <span class="members__name">{{ member.name }}</span>
            @if (member.isOwner) {
              <span class="pill">{{ t('share.ownerBadge') }}</span>
            }
            @if (canManage() && !member.isOwner) {
              @if (pendingRemovalUid() === member.uid) {
                <div
                  class="members__confirm"
                  role="group"
                  [attr.aria-label]="t('share.removeConfirmFor', { name: member.name })"
                >
                  <label class="members__checkbox">
                    <input type="checkbox" [checked]="revokeLink()" (change)="onRevokeLinkChange($event)" />
                    {{ t('share.alsoRevokeLink') }}
                  </label>
                  <div class="form-actions">
                    <button type="button" class="btn-outline-pill" (click)="cancelRemoval(member.uid)">
                      {{ t('common.cancel') }}
                    </button>
                    <button type="button" class="btn-accent-pill-lg" (click)="confirmRemoval(member.uid)">
                      {{ t('share.removeConfirm') }}
                    </button>
                  </div>
                </div>
              } @else {
                <button
                  type="button"
                  class="icon-btn"
                  (click)="startRemoval(member.uid)"
                  [attr.aria-label]="t('share.removeMemberFor', { name: member.name })"
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
                  </svg>
                </button>
              }
            }
          </li>
        }
      </ul>
      @if (!canManage()) {
        <button type="button" class="btn-outline-pill" (click)="leave()">{{ t('share.leave') }}</button>
      }
    </section>
  `,
  styles: `
    .share-section h3 {
      margin: 0 0 0.5rem;
      font-size: 1rem;
    }

    .members {
      list-style: none;
      margin: 0 0 1rem;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .members__item {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }

    .members__name {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .members__confirm {
      flex-basis: 100%;
    }

    .members__checkbox {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
  `,
})
export class MembersPanel {
  readonly list = input.required<ShoppingList>();
  /** True for the owner: may remove members. Members get "Leave" instead. */
  readonly canManage = input(false);
  readonly left = output<void>();
  readonly linkRevoked = output<void>();

  private readonly sharingService = inject(ShoppingListSharingService);
  private readonly confirmDialogService = inject(ConfirmDialogService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly t = inject(I18n).t;

  protected readonly pendingRemovalUid = signal<string | null>(null);
  protected readonly revokeLink = signal(true);

  protected readonly members = computed<MemberView[]>(() => {
    const list = this.list();
    return list.memberIds
      .map((uid) => ({ uid, name: list.memberNames[uid] ?? uid, isOwner: uid === list.ownerId }))
      .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name));
  });

  protected startRemoval(uid: string): void {
    this.revokeLink.set(true);
    this.pendingRemovalUid.set(uid);
    this.focusAfterRender('.members__confirm input');
  }

  protected cancelRemoval(uid: string): void {
    this.pendingRemovalUid.set(null);
    this.focusAfterRender(`[data-member-uid="${uid}"] .icon-btn`);
  }

  protected onRevokeLinkChange(event: Event): void {
    this.revokeLink.set((event.target as HTMLInputElement).checked);
  }

  protected async confirmRemoval(uid: string): Promise<void> {
    const revokeLink = this.revokeLink();
    const removed = await this.sharingService.removeMember(this.list().id, uid, revokeLink);
    this.pendingRemovalUid.set(null);
    this.focusAfterRender('#members-heading');
    if (removed && revokeLink) {
      this.linkRevoked.emit();
    }
  }

  protected async leave(): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: this.t('share.leaveTitle'),
      message: this.t('share.leaveMessage'),
      confirmLabel: this.t('share.leaveConfirm'),
    });
    if (confirmed && (await this.sharingService.leave(this.list().id))) {
      this.left.emit();
    }
  }

  /** Keeps keyboard focus on a sensible element when the button that had it disappears. */
  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }
}
