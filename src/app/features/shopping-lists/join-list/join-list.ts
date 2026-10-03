import { Component, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n } from '../../../core/i18n/i18n.service';
import { ShoppingListSharingService } from '../data/shopping-list-sharing.service';

type JoinState = 'joining' | 'invalid' | 'failed';

@Component({
  selector: 'app-join-list',
  imports: [RouterLink],
  template: `
    <div class="page">
      @switch (state()) {
        @case ('joining') {
          <p role="status">{{ t('join.joining') }}</p>
        }
        @case ('invalid') {
          <div role="alert">
            <h1>{{ t('join.invalidTitle') }}</h1>
            <p>{{ t('join.invalidMessage') }}</p>
          </div>
          <a class="btn-accent-pill-lg" routerLink="/lists">{{ t('join.goToLists') }}</a>
        }
        @case ('failed') {
          <div role="alert">
            <h1>{{ t('join.failedTitle') }}</h1>
          </div>
          <a class="btn-accent-pill-lg" routerLink="/lists">{{ t('join.goToLists') }}</a>
        }
      }
    </div>
  `,
})
export class JoinList implements OnInit {
  readonly listId = input.required<string>();
  readonly token = input.required<string>();

  private readonly sharingService = inject(ShoppingListSharingService);
  private readonly router = inject(Router);
  protected readonly t = inject(I18n).t;
  protected readonly state = signal<JoinState>('joining');

  ngOnInit(): void {
    void this.join();
  }

  private async join(): Promise<void> {
    const result = await this.sharingService.join(this.listId(), this.token());
    if (result === 'joined' || result === 'already-member') {
      await this.router.navigate(['/lists', this.listId()], { replaceUrl: true });
      return;
    }
    this.state.set(result === 'invalid-link' ? 'invalid' : 'failed');
  }
}
