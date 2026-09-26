import { computed, signal } from '@angular/core';
import type { User } from 'firebase/auth';
import { AuthService } from '../core/auth/auth.service';

export interface FakeAuthService extends AuthService {
  setUser(user: User | null | undefined): void;
}

export function createFakeAuthService(initialUid: string | null = 'test-uid'): FakeAuthService {
  const initialUser = initialUid ? ({ uid: initialUid } as User) : initialUid === null ? null : undefined;
  const userSignal = signal<User | null | undefined>(initialUser);

  return {
    user: userSignal.asReadonly(),
    uid: computed(() => userSignal()?.uid ?? null),
    signInWithGoogle: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    setUser: (user: User | null | undefined) => userSignal.set(user),
  } as unknown as FakeAuthService;
}
