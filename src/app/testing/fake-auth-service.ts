import { computed, signal } from '@angular/core';
import type { User } from 'firebase/auth';
import { AuthService, toDisplayName } from '../core/auth/auth.service';

export interface FakeAuthService extends AuthService {
  setUser(user: User | null | undefined): void;
}

export function createFakeAuthService(initialUid: string | null = 'test-uid'): FakeAuthService {
  const initialUser = initialUid
    ? ({ uid: initialUid, displayName: 'Test User' } as User)
    : initialUid === null
      ? null
      : undefined;
  const userSignal = signal<User | null | undefined>(initialUser);

  return {
    user: userSignal.asReadonly(),
    uid: computed(() => userSignal()?.uid ?? null),
    displayName: computed(() => toDisplayName(userSignal())),
    signInWithGoogle: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    setUser: (user: User | null | undefined) => userSignal.set(user),
  } as unknown as FakeAuthService;
}
