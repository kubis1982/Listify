import { Component, inject } from '@angular/core';
import { I18n } from '../../i18n/i18n.service';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-sign-in-screen',
  template: `
    <div class="sign-in-screen">
      <h1>{{ t('auth.signInTitle') }}</h1>
      <button type="button" class="btn-accent-pill-lg" (click)="authService.signInWithGoogle()">
        {{ t('auth.signInWithGoogle') }}
      </button>
    </div>
  `,
  styles: `
    .sign-in-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1.5rem;
      min-height: 100vh;
      text-align: center;
      padding: 1rem;
    }
  `,
})
export class SignInScreen {
  protected readonly authService = inject(AuthService);
  protected readonly t = inject(I18n).t;
}
