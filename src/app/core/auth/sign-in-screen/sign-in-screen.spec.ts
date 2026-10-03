import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../auth.service';
import { createFakeAuthService } from '../../../testing/fake-auth-service';
import { SignInScreen } from './sign-in-screen';

describe('SignInScreen', () => {
  it('calls signInWithGoogle when the button is clicked', () => {
    const fakeAuth = createFakeAuthService(null);
    const signInSpy = vi.spyOn(fakeAuth, 'signInWithGoogle');
    TestBed.configureTestingModule({
      imports: [SignInScreen],
      providers: [{ provide: AuthService, useValue: fakeAuth }],
    });

    const fixture = TestBed.createComponent(SignInScreen);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();

    expect(signInSpy).toHaveBeenCalled();
  });

  it('renders a visible text label, not an icon-only button', () => {
    TestBed.configureTestingModule({
      imports: [SignInScreen],
      providers: [{ provide: AuthService, useValue: createFakeAuthService(null) }],
    });

    const fixture = TestBed.createComponent(SignInScreen);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;

    expect(button.textContent?.trim().length).toBeGreaterThan(0);
  });
});
