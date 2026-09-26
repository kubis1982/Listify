import { computed, inject, signal, Service } from '@angular/core';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { FIREBASE_AUTH } from '../firebase/firebase.providers';

@Service()
export class AuthService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly currentUser = signal<User | null | undefined>(undefined);

  readonly user = this.currentUser.asReadonly();
  readonly uid = computed(() => this.user()?.uid ?? null);

  constructor() {
    onAuthStateChanged(this.auth, (user) => this.currentUser.set(user));
  }

  async signInWithGoogle(): Promise<void> {
    try {
      await signInWithPopup(this.auth, new GoogleAuthProvider());
    } catch {
      // User closed the popup, or it was blocked — the sign-in screen just
      // stays visible for another attempt; nothing to surface as an error.
    }
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }
}
