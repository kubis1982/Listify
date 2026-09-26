import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { I18n } from './core/i18n/i18n.service';
import { SignInScreen } from './core/auth/sign-in-screen/sign-in-screen';
import { LanguageSwitcher } from './shared/language-switcher/language-switcher';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, LanguageSwitcher, SignInScreen],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '(document:keydown.escape)': 'closeMenu()',
  },
})
export class App {
  protected readonly authService = inject(AuthService);
  protected readonly t = inject(I18n).t;
  protected readonly isMenuOpen = signal(false);

  protected toggleMenu(): void {
    this.isMenuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.isMenuOpen.set(false);
  }
}
