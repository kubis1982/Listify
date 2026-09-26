import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { App } from './app';
import { AuthService } from './core/auth/auth.service';
import { createFakeAuthService } from './testing/fake-auth-service';

@Component({ template: '' })
class DummyRouteComponent {}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([{ path: '**', component: DummyRouteComponent }]),
        { provide: AuthService, useValue: createFakeAuthService() },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renders navigation links to all sections', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('nav a')).map(
      (a) => a.getAttribute('href'),
    );
    expect(links).toEqual(['/lists', '/products', '/units', '/categories']);
  });

  it('collapses the nav behind a closed menu toggle by default', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector('.menu-toggle') as HTMLButtonElement;
    const nav = element.querySelector('nav') as HTMLElement;

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(nav.classList.contains('open')).toBe(false);
  });

  it('opens the nav when the menu toggle is clicked', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector('.menu-toggle') as HTMLButtonElement;

    toggle.click();
    fixture.detectChanges();

    const nav = element.querySelector('nav') as HTMLElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(nav.classList.contains('open')).toBe(true);
  });

  it('closes the nav when a link is clicked', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector('.menu-toggle') as HTMLButtonElement;

    toggle.click();
    fixture.detectChanges();
    (element.querySelector('nav a') as HTMLAnchorElement).click();
    fixture.detectChanges();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect((element.querySelector('nav') as HTMLElement).classList.contains('open')).toBe(false);
  });

  it('closes the nav when Escape is pressed', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector('.menu-toggle') as HTMLButtonElement;

    toggle.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect((element.querySelector('nav') as HTMLElement).classList.contains('open')).toBe(false);
  });

  it('places the language switcher in the header, outside the collapsible nav', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('header app-language-switcher')).toBeTruthy();
    expect(element.querySelector('#main-nav app-language-switcher')).toBeFalsy();
  });

  it('keeps nav links clickable even while the menu toggle is closed', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    (element.querySelector('nav a[href="/units"]') as HTMLAnchorElement).click();
    fixture.detectChanges();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(TestBed.inject(Router).url).toBe('/units');
  });

  it('shows the sign-in screen when signed out', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([{ path: '**', component: DummyRouteComponent }]),
        { provide: AuthService, useValue: createFakeAuthService(null) },
      ],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-sign-in-screen')).toBeTruthy();
    expect(element.querySelector('header')).toBeFalsy();
  });

  it('shows the app layout once signed in', async () => {
    TestBed.resetTestingModule();
    const fakeAuth = createFakeAuthService(null);
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([{ path: '**', component: DummyRouteComponent }]),
        { provide: AuthService, useValue: fakeAuth },
      ],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('header')).toBeFalsy();

    fakeAuth.setUser({ uid: 'user-1' } as never);
    fixture.detectChanges();
    await TestBed.inject(ApplicationRef).whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('header')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-sign-in-screen')).toBeFalsy();
  });

  it('signs out from the user menu', () => {
    TestBed.resetTestingModule();
    const fakeAuth = createFakeAuthService('user-1');
    const signOutSpy = vi.spyOn(fakeAuth, 'signOut');
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([{ path: '**', component: DummyRouteComponent }]),
        { provide: AuthService, useValue: fakeAuth },
      ],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.sign-out-button')!.click();

    expect(signOutSpy).toHaveBeenCalled();
  });
});
