import { InjectionToken, inject, isDevMode } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  Firestore,
  initializeFirestore,
  persistentLocalCache,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP', {
  providedIn: 'root',
  factory: () => initializeApp(environment.firebase),
});

export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE', {
  providedIn: 'root',
  factory: () => {
    const firestore = initializeFirestore(inject(FIREBASE_APP), {
      localCache: persistentLocalCache(),
      ignoreUndefinedProperties: true,
    });
    if (isDevMode()) {
      connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    }
    return firestore;
  },
});

export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH', {
  providedIn: 'root',
  factory: () => {
    const auth = getAuth(inject(FIREBASE_APP));
    if (isDevMode()) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
    return auth;
  },
});
