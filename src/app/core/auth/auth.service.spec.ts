import { TestBed } from '@angular/core/testing';
import { FIREBASE_AUTH } from '../firebase/firebase.providers';
import { AuthService, toDisplayName } from './auth.service';

type AuthStateCallback = (user: { uid: string } | null) => void;

function createFakeFirebaseAuth() {
  let callback: AuthStateCallback | undefined;
  return {
    fakeAuth: {
      onAuthStateChanged: (cb: AuthStateCallback) => {
        callback = cb;
        return () => {
          callback = undefined;
        };
      },
    },
    emit: (user: { uid: string } | null) => callback?.(user),
  };
}

describe('AuthService', () => {
  it('starts with user() undefined before the first auth-state callback', () => {
    const { fakeAuth } = createFakeFirebaseAuth();
    TestBed.configureTestingModule({
      providers: [{ provide: FIREBASE_AUTH, useValue: fakeAuth }],
    });
    const service = TestBed.inject(AuthService);
    expect(service.user()).toBeUndefined();
    expect(service.uid()).toBeNull();
  });

  it('reflects a signed-out state as null', () => {
    const { fakeAuth, emit } = createFakeFirebaseAuth();
    TestBed.configureTestingModule({
      providers: [{ provide: FIREBASE_AUTH, useValue: fakeAuth }],
    });
    const service = TestBed.inject(AuthService);

    emit(null);

    expect(service.user()).toBeNull();
    expect(service.uid()).toBeNull();
  });

  it('reflects a signed-in state and derives uid', () => {
    const { fakeAuth, emit } = createFakeFirebaseAuth();
    TestBed.configureTestingModule({
      providers: [{ provide: FIREBASE_AUTH, useValue: fakeAuth }],
    });
    const service = TestBed.inject(AuthService);

    emit({ uid: 'user-123' });

    expect(service.uid()).toBe('user-123');
  });

  it('does not throw when the Google popup is closed by the user', async () => {
    const { fakeAuth } = createFakeFirebaseAuth();
    TestBed.configureTestingModule({
      providers: [{ provide: FIREBASE_AUTH, useValue: fakeAuth }],
    });
    const service = TestBed.inject(AuthService);

    // signInWithPopup will reject in this jsdom environment (no real
    // popup capability); the assertion is that AuthService swallows it.
    await expect(service.signInWithGoogle()).resolves.toBeUndefined();
    expect(service.user()).toBeUndefined();
  });
});

describe('toDisplayName', () => {
  it('prefers the Google display name', () => {
    expect(toDisplayName({ displayName: 'Ania', email: 'ania@example.com' })).toBe('Ania');
  });

  it('falls back to the e-mail when there is no display name', () => {
    expect(toDisplayName({ displayName: null, email: 'ania@example.com' })).toBe('ania@example.com');
  });

  it('never returns an empty name', () => {
    expect(toDisplayName({ displayName: '', email: null })).toBe('Listify');
    expect(toDisplayName(null)).toBe('Listify');
  });

  it('truncates names to the 100 characters firestore.rules accepts', () => {
    expect(toDisplayName({ displayName: 'x'.repeat(150), email: null })).toHaveLength(100);
  });
});
