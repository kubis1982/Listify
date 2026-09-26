import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signOut as firebaseSignOut,
  type Auth,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import { signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { FIRESTORE } from '../firebase/firebase.providers';
import { createFirestoreCollection } from './firestore-collection';

interface Category {
  id: string;
  name: string;
}

async function isEmulatorReachable(url: string): Promise<boolean> {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
}

const emulatorAvailable = await isEmulatorReachable('http://127.0.0.1:8080/');

describe.skipIf(!emulatorAvailable)('createFirestoreCollection (Firestore emulator)', () => {
  let app: FirebaseApp;
  let auth: Auth;
  let firestore: Firestore;
  let uid: string;

  beforeEach(async () => {
    app = initializeApp({ projectId: 'listify-9658c', apiKey: 'test-key' }, `test-${crypto.randomUUID()}`);
    auth = getAuth(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    firestore = getFirestore(app);
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);

    const email = `${crypto.randomUUID()}@example.com`;
    const credential = await createUserWithEmailAndPassword(auth, email, 'Test1234!');
    uid = credential.user.uid;

    TestBed.configureTestingModule({
      providers: [
        { provide: FIRESTORE, useValue: firestore },
        {
          provide: AuthService,
          useValue: {
            user: signal(credential.user).asReadonly(),
            uid: signal(uid).asReadonly(),
            signInWithGoogle: () => Promise.resolve(),
            signOut: () => Promise.resolve(),
          } as unknown as AuthService,
        },
      ],
    });
  });

  afterEach(async () => {
    await firebaseSignOut(auth);
    await deleteApp(app);
  });

  function createCategories() {
    return TestBed.runInInjectionContext(() =>
      createFirestoreCollection<Category>({
        query: (fs, u) => collection(fs, `users/${u}/categories`),
        docPath: (u, id) => `users/${u}/categories/${id}`,
      }),
    );
  }

  it('reflects a document written with add()', async () => {
    const categories = createCategories();

    categories.add({ id: 'cat-1', name: 'Dairy' });

    await vi.waitFor(() => {
      expect(categories.items()).toEqual([{ id: 'cat-1', name: 'Dairy' }]);
    });
  });

  it('reflects update() and remove()', async () => {
    const categories = createCategories();
    categories.add({ id: 'cat-1', name: 'Dairy' });
    await vi.waitFor(() => expect(categories.items()).toHaveLength(1));

    categories.update('cat-1', { name: 'Dairy & Eggs' });
    await vi.waitFor(() => {
      expect(categories.items()).toEqual([{ id: 'cat-1', name: 'Dairy & Eggs' }]);
    });

    categories.remove('cat-1');
    await vi.waitFor(() => expect(categories.items()).toEqual([]));
  });

  it('never reflects a write rejected by firestore.rules (wrong user path)', async () => {
    const confirmDialogService = TestBed.inject(ConfirmDialogService);
    const alertSpy = vi.spyOn(confirmDialogService, 'alert').mockResolvedValue();

    const otherUsersCategories = TestBed.runInInjectionContext(() =>
      createFirestoreCollection<Category>({
        query: (fs, u) => collection(fs, `users/${u}/categories`),
        // deliberately mismatched: docPath ignores the signed-in uid and
        // targets a different user's subtree, which firestore.rules must
        // reject (isOwner(userId) requires request.auth.uid == userId)
        docPath: (_u, id) => `users/some-other-uid/categories/${id}`,
      }),
    );

    otherUsersCategories.add({ id: 'cat-1', name: 'Should be denied' });

    await vi.waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(otherUsersCategories.items()).toEqual([]);
  });
});
