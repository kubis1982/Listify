# Firestore Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Listify's `localStorage` persistence with a per-user Firestore data layer (categories, products, units, shopping lists) gated behind Google Sign-In, while keeping the four feature services' public method signatures unchanged.

**Architecture:** A generic `createFirestoreCollection<T>()` factory (raw modular `firebase/firestore` SDK, no `@angular/fire`) reproduces today's `LocalStorageCollection<T>` shape (`items()/add()/update()/remove()`) behind per-collection `InjectionToken`s, so the four feature services change minimally. A new `AuthService` (Google Sign-In via `firebase/auth`) gates the whole app at the root component. Tests get a synchronous in-memory fake behind the same tokens, so only one dedicated spec talks to the real Firebase Emulator Suite.

**Tech Stack:** Angular 22 (standalone components, signals, `@Service()`), `firebase` (modular SDK, already a dependency), Vitest (`@angular/build:unit-test`), Firebase Emulator Suite (Auth + Firestore, already configured in `firebase.json`).

**Spec:** `docs/superpowers/specs/2026-09-26-firestore-integration-design.md`

## Global Constraints

- No `@angular/fire` dependency — use `firebase/app`, `firebase/auth`, `firebase/firestore` directly (spec Decisions).
- No migration of existing `localStorage` data — Firestore starts empty per user (spec Decisions/Non-goals).
- Deploy target stays classic Firebase Hosting — do not add App Hosting/SSR (spec Non-goals).
- Auth provider is Google Sign-In only — no anonymous/email/password auth (spec Decisions).
- The four feature services (`CategoriesService`, `ProductsService`, `UnitsService`, `ShoppingListsService`) keep their existing public method names/signatures — synchronous, not `Promise`-returning (spec Goals).
- `firestore.rules`'s `shoppingLists.createdAt` must validate a string (ISO date), not Firestore `timestamp` (spec: firestore.rules correction).
- Follow `CLAUDE.md`: standalone components (no `standalone: true`), no explicit `ChangeDetectionStrategy.OnPush`, signals for state, `input()`/`output()`/`model()` not decorators, no `@HostBinding`/`@HostListener` (use `host: {}`), no `ngClass`/`ngStyle`, don't import `CommonModule` (import specific directives/pipes), `inject()` not constructor injection, prefer `@Service()` over `@Injectable({ providedIn: 'root' })`.
- New UI (sign-in screen, user menu) must pass AXE/WCAG AA: visible text labels, not icon-only; correct focus management.
- Commit messages in English.

## Review Focus

- **Downstream component tests silently broken by `NullInjectorError`.** Seven existing spec files transitively construct one of the four feature services without knowing about `AuthService`/Firestore tokens (`categories-manager.spec.ts`, `units-manager.spec.ts`, `products-manager.spec.ts`, `product-picker.spec.ts`, `create-product-dialog.spec.ts`, `shopping-lists-overview.spec.ts`, `shopping-list-detail.spec.ts`), plus `app.spec.ts` for the new gating. Each must get `provideFakeCollection(...)` for the specific token(s) it needs and/or `createFakeAuthService()` — Tasks 7-10 and Task 6 each carry the specific file(s).
- **Silent data loss when nobody is signed in.** `createFirestoreCollection`'s `add`/`update`/`remove` must surface the same "couldn't save" alert when called with no `uid` (should be unreachable given the app gates on auth, but a future caller mistake must not fail invisibly) as when a real Firestore write is rejected — Task 2's implementation calls `reportError()` in both branches, not just the `.catch()`.
- **`firestore.rules`/model mismatch on `createdAt`.** If the rule still expects `timestamp` while the app writes an ISO string (or vice versa), every shopping-list write is rejected by the deployed rules. Task 3 fixes and redeploys the rule *before* Task 10 starts writing real `ShoppingList` documents against it, and Task 2's emulator spec exercises a write against the deployed rule.
- **Google sign-in popup closed/blocked leaves the app stuck.** `AuthService.signInWithGoogle()` must swallow the rejection so `user` stays at its last resolved value (`null`), not hang at `undefined` — Task 4's test exercises a rejected popup.
- **Existing synchronous test assertions (`service.add(...); expect(items()).toEqual(...)` with no `await`).** The real `createFirestoreCollection` updates asynchronously (even with local-cache latency compensation, never in the same call stack) — Task 2's in-memory test double is deliberately fully synchronous so these existing assertions keep working unchanged; only the one dedicated Firestore-emulator spec in Task 2 uses `vi.waitFor`.

---

## File Structure

New files:
- `src/environments/environment.ts` — public Firebase Web SDK config.
- `src/app/core/firebase/firebase.providers.ts` — `FIREBASE_APP`, `FIRESTORE`, `FIREBASE_AUTH` injection tokens (self-registering, `providedIn: 'root'`).
- `src/app/core/storage/firestore-collection.ts` — `FirestoreCollection<T>` interface + `createFirestoreCollection()`.
- `src/app/core/storage/firestore-collection.spec.ts` — the one Firebase-Emulator-backed test.
- `src/app/core/testing/in-memory-collection.ts` — synchronous fake satisfying `FirestoreCollection<T>`, plus `provideFakeCollection(token)` to register it as a DI override for one specific collection token.
- `src/app/core/auth/auth.service.ts` + `.spec.ts` — Google Sign-In wrapper.
- `src/app/core/auth/sign-in-screen/sign-in-screen.ts` + `.spec.ts` — the signed-out screen.
- `src/app/testing/fake-auth-service.ts` — `createFakeAuthService()`.

Modified files: `app.config.ts` is **not** touched (the tokens self-register via `providedIn: 'root'`). `app.ts`/`app.html`/`app.spec.ts`, the four feature services and their specs, `shopping-list.model.ts`, the seven downstream spec files listed in Review Focus, `firestore.rules`, `package.json`, `en.ts`/`pl.ts`.

Deleted files: `src/app/core/storage/local-storage-collection.ts` + `.spec.ts` (Task 10 Step 8, once nothing references them).

---

## Task 1: Firebase project wiring

**Files:**
- Create: `src/environments/environment.ts`
- Create: `src/app/core/firebase/firebase.providers.ts`
- Test: `src/app/core/firebase/firebase.providers.spec.ts`

**Interfaces:**
- Produces: `environment: { firebase: FirebaseOptions }` (from `src/environments/environment.ts`); `FIREBASE_APP: InjectionToken<FirebaseApp>`, `FIRESTORE: InjectionToken<Firestore>`, `FIREBASE_AUTH: InjectionToken<Auth>` (from `src/app/core/firebase/firebase.providers.ts`), each `providedIn: 'root'`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/core/firebase/firebase.providers.spec.ts
import { TestBed } from '@angular/core/testing';
import { FIREBASE_APP, FIRESTORE, FIREBASE_AUTH } from './firebase.providers';

describe('Firebase providers', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('provides a FirebaseApp for the configured project', () => {
    const app = TestBed.inject(FIREBASE_APP);
    expect(app.options.projectId).toBe('listify-9658c');
  });

  it('provides a Firestore instance backed by the same app', () => {
    const firestore = TestBed.inject(FIRESTORE);
    expect(firestore.app).toBe(TestBed.inject(FIREBASE_APP));
  });

  it('provides an Auth instance backed by the same app', () => {
    const auth = TestBed.inject(FIREBASE_AUTH);
    expect(auth.app).toBe(TestBed.inject(FIREBASE_APP));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include='**/firebase.providers.spec.ts'`
Expected: FAIL — cannot find module `./firebase.providers`.

- [ ] **Step 3: Create the environment file**

```ts
// src/environments/environment.ts
import { FirebaseOptions } from 'firebase/app';

export const environment: { firebase: FirebaseOptions } = {
  firebase: {
    projectId: 'listify-9658c',
    appId: '1:798401891070:web:fe656b5d945b60738a33af',
    databaseURL: 'https://listify-9658c-default-rtdb.europe-west1.firebasedatabase.app',
    storageBucket: 'listify-9658c.firebasestorage.app',
    apiKey: 'AIzaSyChGQkg9W7WOIgP6e4b_RslDhLSsxdP7v4',
    authDomain: 'listify-9658c.firebaseapp.com',
    messagingSenderId: '798401891070',
    measurementId: 'G-47SRCKDTDM',
  },
};
```

This config is the project's public Web SDK config (safe to embed in client
bundles — access control is enforced entirely by `firestore.rules`, not by
hiding this file).

- [ ] **Step 4: Implement the providers**

```ts
// src/app/core/firebase/firebase.providers.ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx ng test --include='**/firebase.providers.spec.ts'`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/environments/environment.ts src/app/core/firebase/
git commit -m "feat(firebase): add Firebase app/auth/firestore providers"
```

---

## Task 2: Generic Firestore collection factory

**Files:**
- Create: `src/app/core/storage/firestore-collection.ts`
- Create: `src/app/core/testing/in-memory-collection.ts`
- Test: `src/app/core/storage/firestore-collection.spec.ts` (Firebase Emulator Suite)
- Test: `src/app/core/testing/in-memory-collection.spec.ts`
- Modify: `package.json` (new `test:integration` script)

**Interfaces:**
- Consumes: `FIRESTORE` (Task 1), `AuthService` (Task 4 — see the task-ordering note below), `ConfirmDialogService` and `I18n` (both already exist in the codebase).
- Produces: `FirestoreCollection<T>` interface, `createFirestoreCollection<T extends { id: string }>(config: { query: (firestore: Firestore, uid: string) => Query<DocumentData>; docPath: (uid: string, id: string) => string }): FirestoreCollection<T>` — used by Tasks 7-10. `createInMemoryCollection<T extends { id: string }>(initial?: readonly T[]): FirestoreCollection<T>` and `provideFakeCollection<T extends { id: string }>(token: InjectionToken<FirestoreCollection<T>>, initial?: readonly T[]): Provider` — used by Tasks 6-10's specs.

**Note on task ordering:** `createFirestoreCollection`'s implementation (Step 3) imports `AuthService`. **Execute Task 4 before this task.** The plan lists this factory as Task 2 and `AuthService` as Task 4 for narrative reasons (the factory is the architectural centerpiece), but the actual execution order is: Task 1, Task 4, Task 2, Task 3, Task 5, Task 6, Tasks 7-10, Task 11.

- [ ] **Step 1: Write the failing test for the in-memory fake (no DI, no Firebase needed)**

```ts
// src/app/core/testing/in-memory-collection.spec.ts
import { InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FirestoreCollection } from '../storage/firestore-collection';
import { createInMemoryCollection, provideFakeCollection } from './in-memory-collection';

interface Widget {
  id: string;
  name: string;
}

const WIDGETS = new InjectionToken<FirestoreCollection<Widget>>('WIDGETS');

describe('createInMemoryCollection', () => {
  it('starts empty by default', () => {
    TestBed.runInInjectionContext(() => {
      const collection = createInMemoryCollection<Widget>();
      expect(collection.items()).toEqual([]);
    });
  });

  it('adds, updates, and removes items synchronously', () => {
    TestBed.runInInjectionContext(() => {
      const collection = createInMemoryCollection<Widget>();

      collection.add({ id: 'w1', name: 'Widget' });
      expect(collection.items()).toEqual([{ id: 'w1', name: 'Widget' }]);

      collection.update('w1', { name: 'Widget v2' });
      expect(collection.items()).toEqual([{ id: 'w1', name: 'Widget v2' }]);

      collection.remove('w1');
      expect(collection.items()).toEqual([]);
    });
  });

  it('accepts a seeded initial value', () => {
    TestBed.runInInjectionContext(() => {
      const collection = createInMemoryCollection<Widget>([{ id: 'seed', name: 'Seeded' }]);
      expect(collection.items()).toEqual([{ id: 'seed', name: 'Seeded' }]);
    });
  });
});

describe('provideFakeCollection', () => {
  it('registers an in-memory fake behind the given token', () => {
    TestBed.configureTestingModule({ providers: [provideFakeCollection(WIDGETS)] });
    const widgets = TestBed.inject(WIDGETS);

    expect(widgets.items()).toEqual([]);
    widgets.add({ id: 'w1', name: 'Widget' });
    expect(widgets.items()).toEqual([{ id: 'w1', name: 'Widget' }]);
  });

  it('accepts a seeded initial value', () => {
    TestBed.configureTestingModule({
      providers: [provideFakeCollection(WIDGETS, [{ id: 'seed', name: 'Seeded' }])],
    });
    expect(TestBed.inject(WIDGETS).items()).toEqual([{ id: 'seed', name: 'Seeded' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include='**/in-memory-collection.spec.ts'`
Expected: FAIL — cannot find module `./in-memory-collection` (and `../storage/firestore-collection`, added next).

- [ ] **Step 3: Implement `FirestoreCollection<T>` and the in-memory fake**

```ts
// src/app/core/storage/firestore-collection.ts
import { effect, inject, signal, Signal } from '@angular/core';
import {
  doc,
  deleteDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
  type Query,
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { AuthService } from '../auth/auth.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { I18n } from '../i18n/i18n.service';

export interface FirestoreCollection<T> {
  readonly items: Signal<readonly T[]>;
  add(item: T): void;
  update(id: string, changes: Partial<T>): void;
  remove(id: string): void;
}

export interface FirestoreCollectionConfig<T> {
  query: (firestore: Firestore, uid: string) => Query<DocumentData>;
  docPath: (uid: string, id: string) => string;
}

/**
 * Creates a signal-backed collection of items of type `T`, persisted to
 * Firestore under paths derived from the signed-in user's uid. Must be
 * called as a field initializer of an injectable class (uses `effect()`
 * and `inject()`, so it needs an injection context) — same constraint the
 * old `createLocalStorageCollection` had. `Firestore` itself is a plain
 * interface (not a class), so it is injected through the `FIRESTORE`
 * `InjectionToken` from Task 1, not directly.
 */
export function createFirestoreCollection<T extends { id: string }>(
  config: FirestoreCollectionConfig<T>,
): FirestoreCollection<T> {
  const firestore = inject(FIRESTORE);
  const authService = inject(AuthService);
  const confirmDialogService = inject(ConfirmDialogService);
  const t = inject(I18n).t;

  const items = signal<readonly T[]>([]);

  function reportError(): void {
    void confirmDialogService.alert({
      title: t('errors.saveFailedTitle'),
      message: t('errors.saveFailedMessage'),
    });
  }

  effect((onCleanup) => {
    const uid = authService.uid();
    if (!uid) {
      items.set([]);
      return;
    }
    const unsubscribe = onSnapshot(config.query(firestore, uid), (snapshot) => {
      items.set(snapshot.docs.map((d) => ({ ...(d.data() as T), id: d.id })));
    });
    onCleanup(unsubscribe);
  });

  return {
    items: items.asReadonly(),
    add: (item: T) => {
      const uid = authService.uid();
      if (!uid) {
        reportError();
        return;
      }
      setDoc(doc(firestore, config.docPath(uid, item.id)), item).catch(reportError);
    },
    update: (id: string, changes: Partial<T>) => {
      const uid = authService.uid();
      if (!uid) {
        reportError();
        return;
      }
      updateDoc(doc(firestore, config.docPath(uid, id)), changes).catch(reportError);
    },
    remove: (id: string) => {
      const uid = authService.uid();
      if (!uid) {
        reportError();
        return;
      }
      deleteDoc(doc(firestore, config.docPath(uid, id))).catch(reportError);
    },
  };
}
```

```ts
// core/testing/in-memory-collection.ts
import { InjectionToken, Provider, signal } from '@angular/core';
import { FirestoreCollection } from '../storage/firestore-collection';

export function createInMemoryCollection<T extends { id: string }>(
  initial: readonly T[] = [],
): FirestoreCollection<T> {
  const items = signal<readonly T[]>(initial);
  return {
    items: items.asReadonly(),
    add: (item: T) => items.update((list) => [...list, item]),
    update: (id: string, changes: Partial<T>) =>
      items.update((list) => list.map((item) => (item.id === id ? { ...item, ...changes } : item))),
    remove: (id: string) => items.update((list) => list.filter((item) => item.id !== id)),
  };
}

/**
 * Overrides one specific collection token with an in-memory fake, for use
 * in a `TestBed.configureTestingModule({ providers: [...] })` call. Each
 * spec that depends on a service backed by `createFirestoreCollection`
 * should register a fake for exactly the token(s) it actually needs —
 * not a blanket bundle of every collection token in the app.
 */
export function provideFakeCollection<T extends { id: string }>(
  token: InjectionToken<FirestoreCollection<T>>,
  initial: readonly T[] = [],
): Provider {
  return { provide: token, useFactory: () => createInMemoryCollection<T>(initial) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ng test --include='**/in-memory-collection.spec.ts'`
Expected: PASS (5 tests)

- [ ] **Step 5: Add the emulator-backed integration test and its npm script**

```ts
// src/app/core/storage/firestore-collection.spec.ts
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
```

Add the integration test script to `package.json`:

```json
{
  "scripts": {
    "ng": "ng",
    "start": "ng serve",
    "build": "ng build",
    "watch": "ng build --watch --configuration development",
    "test": "ng test",
    "test:integration": "firebase emulators:exec --only firestore,auth \"ng test\"",
    "lint": "ng lint"
  }
}
```

- [ ] **Step 6: Run the integration test against the emulator**

Run (starts the emulators for the duration of the test run, then tears them down):
`npm run test:integration`

Expected: PASS (3 tests). If Firebase CLI isn't authenticated in this
environment, `firebase emulators:exec` fails immediately with a clear auth
error — in that case run `npm test` alone first to confirm the other two
suites (`in-memory-collection.spec.ts` from Step 4, everything else)
still pass, and note in the task's commit message that the emulator run
itself needs to be verified by someone with `firebase login` access before
merging.

- [ ] **Step 7: Run the full default suite to confirm the emulator spec skips cleanly without emulators running**

Run: `npm test`
Expected: PASS — `firestore-collection.spec.ts`'s one `describe` block is
skipped (reported as skipped, not failed) because `isEmulatorReachable()`
resolves to `false` when nothing is listening on port 8080.

- [ ] **Step 8: Commit**

```bash
git add src/app/core/storage/ src/app/core/testing/ package.json
git commit -m "feat(firestore): add generic Firestore collection factory with in-memory test double"
```

---

## Task 3: Fix `firestore.rules`'s `createdAt` type

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: none (standalone correction).
- Produces: `shoppingLists.createdAt` now validated as a string, matching the `ShoppingList.createdAt: string` field Task 10 writes.

- [ ] **Step 1: Edit the assumed-data-model comment**

In `firestore.rules`, change the comment line:

```
//   - createdAt: timestamp (required, immutable)
```

to:

```
//   - createdAt: string (required, immutable, ISO 8601 format — format
//     checked only, not logical date validity, e.g. "2026-13-40" would
//     pass; acceptable since this field is informational display data,
//     not used for access control)
```

- [ ] **Step 2: Add a date-string validator helper and use it**

Add this helper next to the other helper functions (after `isPositive`):

```
    function isValidDateString(value) {
      return value is string &&
        value.matches("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}.*Z?$");
    }
```

In `isValidShoppingList`, change:

```
        data.createdAt is timestamp &&
```

to:

```
        isValidDateString(data.createdAt) &&
```

- [ ] **Step 3: Validate the rules compile**

Run: `npx -y firebase-tools@latest deploy --only firestore:rules --dry-run`
Expected: `cloud.firestore: rules file firestore.rules compiled successfully`

- [ ] **Step 4: Deploy the corrected rules**

Run: `npx -y firebase-tools@latest deploy --only firestore:rules`
Expected: `firestore: released rules firestore.rules to cloud.firestore`

- [ ] **Step 5: Commit**

```bash
git add firestore.rules
git commit -m "fix(firestore): validate shoppingLists.createdAt as a string, not a timestamp"
```

---

## Task 4: `AuthService`

**Files:**
- Create: `src/app/core/auth/auth.service.ts`
- Test: `src/app/core/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `FIREBASE_AUTH` (Task 1).
- Produces: `AuthService` with `user: Signal<User | null | undefined>`, `uid: Signal<string | null>`, `signInWithGoogle(): Promise<void>`, `signOut(): Promise<void>` — used by Task 2 (already written above, forward-declared), Task 5, Task 6, and Tasks 7-10's `ShoppingListsService`.

**Run this task before Task 2's steps**, per Task 2's ordering note.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/core/auth/auth.service.spec.ts
import { InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FIREBASE_AUTH } from '../firebase/firebase.providers';
import { AuthService } from './auth.service';

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
});
```

(`InjectionToken` import above is unused if your editor flags it — it's
kept only because `FIREBASE_AUTH`'s declared type is `InjectionToken<Auth>`
and some lint configs want it in scope for the fake's type inference; if
`ng lint` complains about the unused import after Step 4, remove that
import line.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include='**/auth.service.spec.ts'`
Expected: FAIL — cannot find module `./auth.service`.

- [ ] **Step 3: Implement `AuthService`**

```ts
// src/app/core/auth/auth.service.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ng test --include='**/auth.service.spec.ts'`
Expected: PASS (3 tests)

- [ ] **Step 5: Add the rejected-popup test**

Add this test to the same `describe` block:

```ts
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx ng test --include='**/auth.service.spec.ts'`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add src/app/core/auth/auth.service.ts src/app/core/auth/auth.service.spec.ts
git commit -m "feat(auth): add AuthService wrapping Firebase Google Sign-In"
```

---

## Task 5: `createFakeAuthService` test double

**Files:**
- Create: `src/app/testing/fake-auth-service.ts`
- Test: `src/app/testing/fake-auth-service.spec.ts`

**Interfaces:**
- Consumes: `AuthService` (Task 4).
- Produces: `createFakeAuthService(initialUid?: string | null): AuthService & { setUser(user: import('firebase/auth').User | null | undefined): void }` — used by Task 6 and, together with `provideFakeCollection` (Task 2), by Tasks 7-10's downstream spec fixes.

This task is fully self-contained (no dependency on the four feature
services' tokens, unlike an earlier draft of this plan that bundled a
combined fake — dropped in favor of Task 2's per-token
`provideFakeCollection`, since most specs only need one or two of the four
tokens faked, not all of them).

- [ ] **Step 1: Write the failing test for the auth fake**

```ts
// src/app/testing/fake-auth-service.spec.ts
import { createFakeAuthService } from './fake-auth-service';

describe('createFakeAuthService', () => {
  it('defaults to a signed-in fake user', () => {
    const fake = createFakeAuthService();
    expect(fake.uid()).toBe('test-uid');
    expect(fake.user()).toEqual(expect.objectContaining({ uid: 'test-uid' }));
  });

  it('can start signed out', () => {
    const fake = createFakeAuthService(null);
    expect(fake.uid()).toBeNull();
    expect(fake.user()).toBeNull();
  });

  it('lets a test flip the signed-in state', () => {
    const fake = createFakeAuthService(null);
    fake.setUser({ uid: 'later-uid' } as never);
    expect(fake.uid()).toBe('later-uid');
  });

  it('signInWithGoogle and signOut resolve without doing anything', async () => {
    const fake = createFakeAuthService();
    await expect(fake.signInWithGoogle()).resolves.toBeUndefined();
    await expect(fake.signOut()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include='**/fake-auth-service.spec.ts'`
Expected: FAIL — cannot find module `./fake-auth-service`.

- [ ] **Step 3: Implement the auth fake**

```ts
// src/app/testing/fake-auth-service.ts
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
    setUser: (user) => userSignal.set(user),
  } as unknown as FakeAuthService;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ng test --include='**/fake-auth-service.spec.ts'`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit the auth fake**

```bash
git add src/app/testing/fake-auth-service.ts src/app/testing/fake-auth-service.spec.ts
git commit -m "test: add createFakeAuthService test double"
```

---

## Task 6: Sign-in screen + app-root gating

**Files:**
- Create: `src/app/core/auth/sign-in-screen/sign-in-screen.ts`
- Test: `src/app/core/auth/sign-in-screen/sign-in-screen.spec.ts`
- Modify: `src/app/app.ts`
- Modify: `src/app/app.html`
- Modify: `src/app/app.spec.ts`
- Modify: `src/app/core/i18n/translations/en.ts`
- Modify: `src/app/core/i18n/translations/pl.ts`

**Interfaces:**
- Consumes: `AuthService` (Task 4), `createFakeAuthService` (Task 5).
- Produces: `SignInScreen` standalone component (selector `app-sign-in-screen`), used only by `App`.

- [ ] **Step 1: Add the new translation keys**

In `src/app/core/i18n/translations/en.ts`, add near `'common.ok'`:

```ts
  'auth.signInTitle': 'Sign in to Listify',
  'auth.signInWithGoogle': 'Sign in with Google',
  'auth.signOut': 'Sign out',
  'errors.saveFailedTitle': "Couldn't save your changes",
  'errors.saveFailedMessage': 'Please check your connection and try again.',
```

In `src/app/core/i18n/translations/pl.ts`, add the matching Polish
translations at the same relative position (match whatever key ordering
`pl.ts` already uses next to its `common.ok` equivalent):

```ts
  'auth.signInTitle': 'Zaloguj się do Listify',
  'auth.signInWithGoogle': 'Zaloguj się przez Google',
  'auth.signOut': 'Wyloguj się',
  'errors.saveFailedTitle': 'Nie udało się zapisać zmian',
  'errors.saveFailedMessage': 'Sprawdź połączenie i spróbuj ponownie.',
```

- [ ] **Step 2: Write the failing test for `SignInScreen`**

```ts
// src/app/core/auth/sign-in-screen/sign-in-screen.spec.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx ng test --include='**/sign-in-screen.spec.ts'`
Expected: FAIL — cannot find module `./sign-in-screen`.

- [ ] **Step 4: Implement `SignInScreen`**

```ts
// src/app/core/auth/sign-in-screen/sign-in-screen.ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx ng test --include='**/sign-in-screen.spec.ts'`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit the sign-in screen**

```bash
git add src/app/core/auth/sign-in-screen/ src/app/core/i18n/translations/
git commit -m "feat(auth): add sign-in screen"
```

- [ ] **Step 7: Add the failing gating tests to `app.spec.ts`**

`App` only injects `AuthService` directly (none of the four feature
services), so its tests need just the auth fake, not any collection
tokens. Add
`providers: [{ provide: AuthService, useValue: createFakeAuthService() }]`
to the existing `TestBed.configureTestingModule({...})` call (so every
pre-existing test in this file keeps rendering the signed-in layout
unchanged), then add these new tests at the end of the `describe` block:

```ts
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
```

Add the new imports at the top of `app.spec.ts`:

```ts
import { vi } from 'vitest';
import { AuthService } from './core/auth/auth.service';
import { createFakeAuthService } from './testing/fake-auth-service';
```

- [ ] **Step 8: Run tests to verify the new ones fail**

Run: `npx ng test --include='**/app.spec.ts'`
Expected: the three new tests FAIL (no `app-sign-in-screen`/`.sign-out-button` yet); the pre-existing tests should still PASS with the fake `AuthService` in place (confirms Step 7's provider addition didn't regress anything before the template changes in the next step).

- [ ] **Step 9: Implement the gating and user menu in `app.ts`/`app.html`**

```ts
// src/app/app.ts
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
```

```html
<!-- src/app/app.html -->
@if (authService.user() !== undefined) {
  @if (authService.user() === null) {
    <app-sign-in-screen />
  } @else {
    <header class="app-header">
      <span class="brand">Listify</span>
      <app-language-switcher />
      <button type="button" class="btn-outline-pill sign-out-button" (click)="authService.signOut()">
        {{ t('auth.signOut') }}
      </button>
      <button
        type="button"
        class="menu-toggle"
        aria-controls="main-nav"
        [attr.aria-expanded]="isMenuOpen()"
        [attr.aria-label]="isMenuOpen() ? t('nav.closeMenu') : t('nav.openMenu')"
        (click)="toggleMenu()"
      >
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>
      <nav id="main-nav" [attr.aria-label]="t('nav.label')" class="nav-links" [class.open]="isMenuOpen()">
        <a class="nav-link" routerLink="/lists" routerLinkActive="active" (click)="closeMenu()">{{ t('nav.lists') }}</a>
        <a class="nav-link" routerLink="/products" routerLinkActive="active" (click)="closeMenu()">{{ t('nav.products') }}</a>
        <a class="nav-link" routerLink="/units" routerLinkActive="active" (click)="closeMenu()">{{ t('nav.units') }}</a>
        <a class="nav-link" routerLink="/categories" routerLinkActive="active" (click)="closeMenu()">{{ t('nav.categories') }}</a>
      </nav>
    </header>

    <main>
      <router-outlet />
    </main>
  }
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npx ng test --include='**/app.spec.ts'`
Expected: PASS (all tests, old and new)

- [ ] **Step 11: Run the full suite to check for incidental regressions**

Run: `npm test`
Expected: PASS. (Only `app.spec.ts` should be affected by this task; if
anything else fails, it means something else also renders `App` — check
before continuing.)

- [ ] **Step 12: Commit**

```bash
git add src/app/app.ts src/app/app.html src/app/app.spec.ts
git commit -m "feat(auth): gate the app behind Google Sign-In"
```

---

## Task 7: Migrate `CategoriesService`

**Files:**
- Modify: `src/app/features/categories/data/categories.service.ts`
- Modify: `src/app/features/categories/data/categories.service.spec.ts`
- Modify: `src/app/features/categories/categories-manager/categories-manager.spec.ts`

**Interfaces:**
- Consumes: `createFirestoreCollection`, `FirestoreCollection<T>`, `createInMemoryCollection`, `provideFakeCollection` (all Task 2).
- Produces: `CATEGORIES_COLLECTION: InjectionToken<FirestoreCollection<Category>>`.

- [ ] **Step 1: Rewrite the failing service spec against the in-memory fake**

```ts
// src/app/features/categories/data/categories.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { createInMemoryCollection } from '../../../core/testing/in-memory-collection';
import { CategoriesService, CATEGORIES_COLLECTION } from './categories.service';

describe('CategoriesService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: CATEGORIES_COLLECTION, useFactory: () => createInMemoryCollection() }],
    });
  });

  it('starts with no categories', () => {
    const service = TestBed.inject(CategoriesService);
    expect(service.categories()).toEqual([]);
  });

  it('adds a category with a generated id', () => {
    const service = TestBed.inject(CategoriesService);
    service.add({ name: 'Dairy' });
    expect(service.categories()).toEqual([expect.objectContaining({ name: 'Dairy' })]);
    expect(service.categories()[0].id).toBeTruthy();
  });

  it('updates an existing category', () => {
    const service = TestBed.inject(CategoriesService);
    service.add({ name: 'Dairy' });
    const id = service.categories()[0].id;
    service.update(id, { name: 'Dairy & Eggs' });
    expect(service.categories()[0].name).toBe('Dairy & Eggs');
  });

  it('removes a category', () => {
    const service = TestBed.inject(CategoriesService);
    service.add({ name: 'Dairy' });
    const id = service.categories()[0].id;
    service.remove(id);
    expect(service.categories()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include='**/categories.service.spec.ts'`
Expected: FAIL — `categories.service.ts` doesn't export `CATEGORIES_COLLECTION` yet.

- [ ] **Step 3: Migrate the service**

```ts
// src/app/features/categories/data/categories.service.ts
import { inject, InjectionToken, Service } from '@angular/core';
import { collection } from 'firebase/firestore';
import { createFirestoreCollection, FirestoreCollection } from '../../../core/storage/firestore-collection';
import { Category, CategoryId } from './category.model';

export const CATEGORIES_COLLECTION = new InjectionToken<FirestoreCollection<Category>>(
  'CATEGORIES_COLLECTION',
  {
    providedIn: 'root',
    factory: () =>
      createFirestoreCollection<Category>({
        query: (firestore, uid) => collection(firestore, `users/${uid}/categories`),
        docPath: (uid, id) => `users/${uid}/categories/${id}`,
      }),
  },
);

@Service()
export class CategoriesService {
  private readonly store = inject(CATEGORIES_COLLECTION);

  readonly categories = this.store.items;

  add(category: Omit<Category, 'id'>): void {
    this.store.add({ ...category, id: crypto.randomUUID() });
  }

  update(id: CategoryId, changes: Partial<Omit<Category, 'id'>>): void {
    this.store.update(id, changes);
  }

  remove(id: CategoryId): void {
    this.store.remove(id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ng test --include='**/categories.service.spec.ts'`
Expected: PASS (4 tests)

- [ ] **Step 5: Add `provideFakeCollection(CATEGORIES_COLLECTION)` to `categories-manager.spec.ts`**

Open `src/app/features/categories/categories-manager/categories-manager.spec.ts`.
Add these imports:

```ts
import { provideFakeCollection } from '../../../core/testing/in-memory-collection';
import { CATEGORIES_COLLECTION } from '../data/categories.service';
```

Find its `TestBed.configureTestingModule({...})` call and add
`provideFakeCollection(CATEGORIES_COLLECTION)` to its `providers` array
(create a `providers: [provideFakeCollection(CATEGORIES_COLLECTION)]` array
if none exists yet; if one already exists, add it as one more entry
alongside whatever is already there).

- [ ] **Step 6: Run test to verify it passes**

Run: `npx ng test --include='**/categories-manager.spec.ts'`
Expected: PASS (same test count as before this task — this step should
cause no behavior change, only make the tests able to construct
`CategoriesService` again without a `NullInjectorError`).

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/features/categories/
git commit -m "feat(categories): back CategoriesService with Firestore"
```

---

## Task 8: Migrate `UnitsService`

**Files:**
- Modify: `src/app/features/units/data/units.service.ts`
- Modify: `src/app/features/units/data/units.service.spec.ts`
- Modify: `src/app/features/units/units-manager/units-manager.spec.ts`

**Interfaces:**
- Consumes: same as Task 7.
- Produces: `UNITS_COLLECTION: InjectionToken<FirestoreCollection<Unit>>`.

- [ ] **Step 1: Rewrite the failing service spec**

```ts
// src/app/features/units/data/units.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { createInMemoryCollection } from '../../../core/testing/in-memory-collection';
import { UnitsService, UNITS_COLLECTION } from './units.service';

describe('UnitsService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: UNITS_COLLECTION, useFactory: () => createInMemoryCollection() }],
    });
  });

  it('starts with no units', () => {
    expect(TestBed.inject(UnitsService).units()).toEqual([]);
  });

  it('adds a unit, lower-casing its symbol', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ symbol: 'KG' });
    expect(service.units()).toEqual([expect.objectContaining({ symbol: 'kg' })]);
  });

  it('marking a unit default clears the previous default', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ symbol: 'kg', isDefault: true });
    service.add({ symbol: 'l', isDefault: true });
    expect(service.units().find((u) => u.symbol === 'kg')?.isDefault).toBe(false);
    expect(service.defaultUnit()?.symbol).toBe('l');
  });

  it('removes a unit', () => {
    const service = TestBed.inject(UnitsService);
    service.add({ symbol: 'kg' });
    const id = service.units()[0].id;
    service.remove(id);
    expect(service.units()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include='**/units.service.spec.ts'`
Expected: FAIL — `units.service.ts` doesn't export `UNITS_COLLECTION` yet.

- [ ] **Step 3: Migrate the service**

```ts
// src/app/features/units/data/units.service.ts
import { computed, inject, InjectionToken, Service } from '@angular/core';
import { collection } from 'firebase/firestore';
import { createFirestoreCollection, FirestoreCollection } from '../../../core/storage/firestore-collection';
import { Unit, UnitId } from './unit.model';

export const UNITS_COLLECTION = new InjectionToken<FirestoreCollection<Unit>>('UNITS_COLLECTION', {
  providedIn: 'root',
  factory: () =>
    createFirestoreCollection<Unit>({
      query: (firestore, uid) => collection(firestore, `users/${uid}/units`),
      docPath: (uid, id) => `users/${uid}/units/${id}`,
    }),
});

@Service()
export class UnitsService {
  private readonly store = inject(UNITS_COLLECTION);

  readonly units = this.store.items;
  readonly defaultUnit = computed(() => this.units().find((unit) => unit.isDefault));

  add(unit: Omit<Unit, 'id'>): void {
    if (unit.isDefault) {
      this.clearDefault();
    }
    this.store.add({ ...unit, symbol: unit.symbol.toLowerCase(), id: crypto.randomUUID() });
  }

  update(id: UnitId, changes: Partial<Omit<Unit, 'id'>>): void {
    if (changes.isDefault) {
      this.clearDefault(id);
    }
    this.store.update(id, {
      ...changes,
      ...(changes.symbol !== undefined ? { symbol: changes.symbol.toLowerCase() } : {}),
    });
  }

  remove(id: UnitId): void {
    this.store.remove(id);
  }

  private clearDefault(excludeId?: UnitId): void {
    for (const unit of this.units()) {
      if (unit.isDefault && unit.id !== excludeId) {
        this.store.update(unit.id, { isDefault: false });
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ng test --include='**/units.service.spec.ts'`
Expected: PASS (4 tests)

- [ ] **Step 5: Add `provideFakeCollection(UNITS_COLLECTION)` to `units-manager.spec.ts`**

Same mechanical change as Task 7 Step 5: add
`import { provideFakeCollection } from '../../../core/testing/in-memory-collection';`
and `import { UNITS_COLLECTION } from '../data/units.service';`, then add
`provideFakeCollection(UNITS_COLLECTION)` to that spec's
`TestBed.configureTestingModule` `providers` array.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx ng test --include='**/units-manager.spec.ts'`
Expected: PASS (same test count as before this task).

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/features/units/
git commit -m "feat(units): back UnitsService with Firestore"
```

---

## Task 9: Migrate `ProductsService` (and drop dead legacy-migration code)

**Files:**
- Modify: `src/app/features/products/data/products.service.ts`
- Modify: `src/app/features/products/data/products.service.spec.ts`
- Modify: `src/app/features/products/products-manager/products-manager.spec.ts`
- Modify: `src/app/shared/product-picker/product-picker.spec.ts`
- Modify: `src/app/features/products/create-product-dialog/create-product-dialog.spec.ts`

**Interfaces:**
- Consumes: same as Task 7.
- Produces: `PRODUCTS_COLLECTION: InjectionToken<FirestoreCollection<Product>>`.

- [ ] **Step 1: Rewrite the failing service spec**

The old `LegacyProductV1`/`migrateProduct` logic only existed to upgrade
records already sitting in `localStorage` under an older shape — with no
`localStorage` migration in scope (spec Non-goals) and a brand-new,
per-user Firestore collection, that dead code and its behavior are
dropped entirely:

```ts
// src/app/features/products/data/products.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { createInMemoryCollection } from '../../../core/testing/in-memory-collection';
import { ProductsService, PRODUCTS_COLLECTION } from './products.service';

describe('ProductsService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: PRODUCTS_COLLECTION, useFactory: () => createInMemoryCollection() }],
    });
  });

  it('starts with no products', () => {
    expect(TestBed.inject(ProductsService).products()).toEqual([]);
  });

  it('adds a product with a generated id and returns it', () => {
    const service = TestBed.inject(ProductsService);
    const created = service.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    expect(created).toEqual(expect.objectContaining({ name: 'Milk' }));
    expect(service.products()).toEqual([created]);
  });

  it('updates an existing product', () => {
    const service = TestBed.inject(ProductsService);
    const created = service.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    service.update(created.id, { name: 'Whole Milk' });
    expect(service.products()[0].name).toBe('Whole Milk');
  });

  it('removes a product', () => {
    const service = TestBed.inject(ProductsService);
    const created = service.add({ name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' });
    service.remove(created.id);
    expect(service.products()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include='**/products.service.spec.ts'`
Expected: FAIL — `products.service.ts` doesn't export `PRODUCTS_COLLECTION` yet.

- [ ] **Step 3: Migrate the service, dropping the legacy migration**

```ts
// src/app/features/products/data/products.service.ts
import { inject, InjectionToken, Service } from '@angular/core';
import { collection } from 'firebase/firestore';
import { createFirestoreCollection, FirestoreCollection } from '../../../core/storage/firestore-collection';
import { Product, ProductId } from './product.model';

export const PRODUCTS_COLLECTION = new InjectionToken<FirestoreCollection<Product>>('PRODUCTS_COLLECTION', {
  providedIn: 'root',
  factory: () =>
    createFirestoreCollection<Product>({
      query: (firestore, uid) => collection(firestore, `users/${uid}/products`),
      docPath: (uid, id) => `users/${uid}/products/${id}`,
    }),
});

@Service()
export class ProductsService {
  private readonly store = inject(PRODUCTS_COLLECTION);

  readonly products = this.store.items;

  add(product: Omit<Product, 'id'>): Product {
    const created: Product = { ...product, id: crypto.randomUUID() };
    this.store.add(created);
    return created;
  }

  update(id: ProductId, changes: Partial<Omit<Product, 'id'>>): void {
    this.store.update(id, changes);
  }

  remove(id: ProductId): void {
    this.store.remove(id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ng test --include='**/products.service.spec.ts'`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the matching `provideFakeCollection(...)` calls to the three downstream specs**

By this point in the plan, `CATEGORIES_COLLECTION` (Task 7) and
`UNITS_COLLECTION` (Task 8) already exist alongside this task's
`PRODUCTS_COLLECTION`, so all three tokens are available.

For each of the three files below, check which of `CategoriesService`,
`ProductsService`, `UnitsService` it imports at the top of the file, add a
matching import of `provideFakeCollection` from
`'../../../core/testing/in-memory-collection'` (adjust the relative depth
to the file's location) plus one import per matching token
(`CATEGORIES_COLLECTION` from `'../../categories/data/categories.service'`,
`PRODUCTS_COLLECTION` from `'../data/products.service'`,
`UNITS_COLLECTION` from `'../../units/data/units.service'` — adjust each
relative path to the file's actual location), then add one
`provideFakeCollection(...)` call per matching token to that file's
`TestBed.configureTestingModule` `providers` array:

- `src/app/features/products/products-manager/products-manager.spec.ts` — imports all three services (confirmed: `CategoriesService`, `UnitsService`, `ProductsService`), so add `provideFakeCollection(CATEGORIES_COLLECTION)`, `provideFakeCollection(UNITS_COLLECTION)`, and `provideFakeCollection(PRODUCTS_COLLECTION)`.
- `src/app/shared/product-picker/product-picker.spec.ts` — add `provideFakeCollection(...)` for whichever of the three tokens match the services it actually imports (open the file and check).
- `src/app/features/products/create-product-dialog/create-product-dialog.spec.ts` — same: check its imports and add the matching token(s).

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx ng test --include='**/products-manager.spec.ts' --include='**/product-picker.spec.ts' --include='**/create-product-dialog.spec.ts'`
Expected: PASS (same test counts as before this task in each file).

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/features/products/ src/app/shared/product-picker/
git commit -m "feat(products): back ProductsService with Firestore, drop legacy localStorage migration"
```

---

## Task 10: Extend `ShoppingList` model + migrate `ShoppingListsService`

**Files:**
- Modify: `src/app/features/shopping-lists/data/shopping-list.model.ts`
- Modify: `src/app/features/shopping-lists/data/shopping-lists.service.ts`
- Modify: `src/app/features/shopping-lists/data/shopping-lists.service.spec.ts`
- Modify: `src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.spec.ts`
- Modify: `src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts`
- Delete: `src/app/core/storage/local-storage-collection.ts`
- Delete: `src/app/core/storage/local-storage-collection.spec.ts`

**Interfaces:**
- Consumes: same as Task 7, plus `AuthService` (Task 4) directly (for `ownerId`/`memberIds`).
- Produces: `SHOPPING_LISTS_COLLECTION: InjectionToken<FirestoreCollection<ShoppingList>>`; `ShoppingList` gains `ownerId: string` and `memberIds: string[]`.

- [ ] **Step 1: Extend the model**

```ts
// src/app/features/shopping-lists/data/shopping-list.model.ts
export type ShoppingListId = string;
export type ShoppingListItemId = string;

export interface ShoppingListItem {
  id: ShoppingListItemId;
  productName: string;
  unitLabel: string;
  categoryName: string;
  quantity: number;
  purchased: boolean;
  note?: string;
}

export interface ShoppingList {
  id: ShoppingListId;
  name: string;
  createdAt: string;
  status: 'active' | 'completed';
  ownerId: string;
  memberIds: string[];
  items: ShoppingListItem[];
}
```

- [ ] **Step 2: Rewrite the failing service spec**

```ts
// src/app/features/shopping-lists/data/shopping-lists.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { createInMemoryCollection } from '../../../core/testing/in-memory-collection';
import { AuthService } from '../../../core/auth/auth.service';
import { createFakeAuthService } from '../../../testing/fake-auth-service';
import { Product } from '../../products/data/product.model';
import { ShoppingListsService, SHOPPING_LISTS_COLLECTION } from './shopping-lists.service';

describe('ShoppingListsService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: SHOPPING_LISTS_COLLECTION, useFactory: () => createInMemoryCollection() },
        { provide: AuthService, useValue: createFakeAuthService('owner-1') },
      ],
    });
  });

  it('starts with no lists', () => {
    expect(TestBed.inject(ShoppingListsService).lists()).toEqual([]);
  });

  it('addList creates an active list owned by the signed-in user', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.addList('Weekend shopping');

    expect(list.name).toBe('Weekend shopping');
    expect(list.status).toBe('active');
    expect(list.ownerId).toBe('owner-1');
    expect(list.memberIds).toEqual(['owner-1']);
    expect(list.items).toEqual([]);
  });

  it('importList creates a fresh list from export data', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.importList({
      name: 'Imported',
      items: [{ productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 2 }],
    });

    expect(list.ownerId).toBe('owner-1');
    expect(list.memberIds).toEqual(['owner-1']);
    expect(list.items).toEqual([
      expect.objectContaining({ productName: 'Milk', quantity: 2, purchased: false }),
    ]);
  });

  it('addItemFromProduct adds a new item to an active list', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.addList('Weekend shopping');
    const product: Product = { id: 'p1', name: 'Milk', unitSymbol: 'l', categoryName: 'Dairy' };

    service.addItemFromProduct(list.id, product, 'l', 2);

    const updated = service.lists().find((l) => l.id === list.id)!;
    expect(updated.items).toEqual([
      expect.objectContaining({ productName: 'Milk', quantity: 2, purchased: false }),
    ]);
  });

  it('setStatus toggles between active and completed', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.addList('Weekend shopping');

    service.setStatus(list.id, 'completed');

    expect(service.lists().find((l) => l.id === list.id)?.status).toBe('completed');
  });

  it('removeList removes the list', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.addList('Weekend shopping');

    service.removeList(list.id);

    expect(service.lists()).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx ng test --include='**/shopping-lists.service.spec.ts'`
Expected: FAIL — `shopping-lists.service.ts` doesn't export `SHOPPING_LISTS_COLLECTION` yet, and the current `ShoppingList` objects it builds have no `ownerId`/`memberIds`.

- [ ] **Step 4: Migrate the service**

```ts
// src/app/features/shopping-lists/data/shopping-lists.service.ts
import { inject, InjectionToken, Service } from '@angular/core';
import { collection, query, where } from 'firebase/firestore';
import { createFirestoreCollection, FirestoreCollection } from '../../../core/storage/firestore-collection';
import { AuthService } from '../../../core/auth/auth.service';
import { Product } from '../../products/data/product.model';
import { type ShoppingListExport } from './shopping-list-export';
import {
  ShoppingList,
  ShoppingListId,
  ShoppingListItem,
  ShoppingListItemId,
} from './shopping-list.model';

export const SHOPPING_LISTS_COLLECTION = new InjectionToken<FirestoreCollection<ShoppingList>>(
  'SHOPPING_LISTS_COLLECTION',
  {
    providedIn: 'root',
    factory: () =>
      createFirestoreCollection<ShoppingList>({
        query: (firestore, uid) =>
          query(collection(firestore, 'shoppingLists'), where('memberIds', 'array-contains', uid)),
        docPath: (_uid, id) => `shoppingLists/${id}`,
      }),
  },
);

@Service()
export class ShoppingListsService {
  private readonly store = inject(SHOPPING_LISTS_COLLECTION);
  private readonly authService = inject(AuthService);

  readonly lists = this.store.items;

  addList(name: string): ShoppingList {
    const uid = this.authService.uid()!;
    const list: ShoppingList = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      status: 'active',
      ownerId: uid,
      memberIds: [uid],
      items: [],
    };
    this.store.add(list);
    return list;
  }

  importList(data: ShoppingListExport['list']): ShoppingList {
    const uid = this.authService.uid()!;
    const list: ShoppingList = {
      id: crypto.randomUUID(),
      name: data.name,
      createdAt: new Date().toISOString(),
      status: 'active',
      ownerId: uid,
      memberIds: [uid],
      items: data.items.map(({ productName, unitLabel, categoryName, quantity, note }) => ({
        id: crypto.randomUUID(),
        productName,
        unitLabel,
        categoryName,
        quantity,
        purchased: false,
        note,
      })),
    };
    this.store.add(list);
    return list;
  }

  setStatus(id: ShoppingListId, status: ShoppingList['status']): void {
    this.store.update(id, { status });
  }

  rename(id: ShoppingListId, name: string): void {
    this.store.update(id, { name });
  }

  removeList(id: ShoppingListId): void {
    this.store.remove(id);
  }

  addItemFromProduct(
    listId: ShoppingListId,
    product: Product,
    unitSymbol: string,
    quantity: number,
    note?: string,
  ): boolean {
    const list = this.lists().find((l) => l.id === listId);
    if (!list || list.status !== 'active') {
      return false;
    }
    const existing = list.items.find((item) =>
      this.isSameUnpurchasedItem(item, product, unitSymbol, note),
    );
    if (existing) {
      this.store.update(listId, {
        items: list.items.map((item) =>
          item.id === existing.id ? { ...item, quantity: item.quantity + quantity } : item,
        ),
      });
      return true;
    }
    const item: ShoppingListItem = {
      id: crypto.randomUUID(),
      productName: product.name,
      unitLabel: unitSymbol,
      categoryName: product.categoryName,
      quantity,
      purchased: false,
      note,
    };
    this.store.update(listId, { items: [...list.items, item] });
    return false;
  }

  private isSameUnpurchasedItem(
    item: ShoppingListItem,
    product: Product,
    unitSymbol: string,
    note?: string,
  ): boolean {
    return (
      !item.purchased &&
      item.productName.toLowerCase() === product.name.toLowerCase() &&
      item.unitLabel.toLowerCase() === unitSymbol.toLowerCase() &&
      (item.note ?? '').toLowerCase() === (note ?? '').toLowerCase()
    );
  }

  setItemPurchased(listId: ShoppingListId, itemId: ShoppingListItemId, purchased: boolean): void {
    const list = this.lists().find((l) => l.id === listId);
    if (!list || list.status !== 'active') {
      return;
    }
    this.store.update(listId, {
      items: list.items.map((item) => (item.id === itemId ? { ...item, purchased } : item)),
    });
  }

  updateItem(
    listId: ShoppingListId,
    itemId: ShoppingListItemId,
    quantity: number,
    note?: string,
  ): void {
    const list = this.lists().find((l) => l.id === listId);
    if (!list || list.status !== 'active') {
      return;
    }
    this.store.update(listId, {
      items: list.items.map((item) => (item.id === itemId ? { ...item, quantity, note } : item)),
    });
  }

  removeItem(listId: ShoppingListId, itemId: ShoppingListItemId): void {
    const list = this.lists().find((l) => l.id === listId);
    if (!list || list.status !== 'active') {
      return;
    }
    this.store.update(listId, { items: list.items.filter((item) => item.id !== itemId) });
  }
}
```

(Only the constructor of `ShoppingList` objects in `addList`/`importList`
changed — every other method is unchanged from before this task.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx ng test --include='**/shopping-lists.service.spec.ts'`
Expected: PASS (6 tests)

- [ ] **Step 6: Add `provideFakeCollection(SHOPPING_LISTS_COLLECTION)` and the fake `AuthService` to the two downstream specs**

For each of:
- `src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.spec.ts`
- `src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts`

add these imports (adjusting relative paths to each file's location):

```ts
import { provideFakeCollection } from '../../../core/testing/in-memory-collection';
import { createFakeAuthService } from '../../../testing/fake-auth-service';
import { AuthService } from '../../../core/auth/auth.service';
import { SHOPPING_LISTS_COLLECTION } from '../data/shopping-lists.service';
```

and add both
`provideFakeCollection(SHOPPING_LISTS_COLLECTION)` and
`{ provide: AuthService, useValue: createFakeAuthService('test-uid') }`
to that file's `TestBed.configureTestingModule` `providers` array. If
either file constructs `ShoppingList` test fixtures directly (object
literals, not through the service), add `ownerId: 'test-uid'` and
`memberIds: ['test-uid']` to those literals so they satisfy the extended
`ShoppingList` type (matching the fake auth service's uid above).

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx ng test --include='**/shopping-lists-overview.spec.ts' --include='**/shopping-list-detail.spec.ts'`
Expected: PASS (same test counts as before this task).

- [ ] **Step 8: Delete the now-unused local-storage collection helper**

```bash
grep -rl "createLocalStorageCollection\|local-storage-collection" src/app --include='*.ts'
```

Expected output: only `src/app/core/storage/local-storage-collection.ts`
and `src/app/core/storage/local-storage-collection.spec.ts` themselves
(no other file references it, since Tasks 7-10 removed the last four
call sites). Delete both files:

```bash
git rm src/app/core/storage/local-storage-collection.ts src/app/core/storage/local-storage-collection.spec.ts
```

If the grep above shows any other file, stop and investigate before
deleting — do not delete a helper something else still depends on.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/app/features/shopping-lists/ src/app/core/storage/
git commit -m "feat(shopping-lists): back ShoppingListsService with Firestore, prepare sharing fields"
```

---

## Task 11: Final verification and deploy

**Files:** none (verification only).

- [ ] **Step 1: Run the full default test suite**

Run: `npm test`
Expected: PASS, zero skipped files other than the emulator-gated
`describe` inside `firestore-collection.spec.ts` when emulators aren't
running.

- [ ] **Step 2: Run the emulator-backed integration suite**

Run: `npm run test:integration`
Expected: PASS, including the two `firestore-collection.spec.ts` write
tests and the permission-denied test.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS. Fix any reported issue before continuing (in particular,
check for now-unused imports left behind by Task 2's `firestore.ts`
edit-in-place steps).

- [ ] **Step 4: Run a production build and check the bundle budget**

Run: `npm run build`

If it succeeds without a budget error, proceed to Step 5.

If it fails with an `initial` bundle budget error (the `angular.json`
budget block under `projects.listify.architect.build.configurations.production.budgets`,
currently `maximumWarning: "500kB"` / `maximumError: "1MB"`), read the
reported actual initial-bundle size from the error output, then set
`maximumError` in that budget entry to a value at least 10% above the
reported actual size, rounded up to the nearest 50kB (for example, an
actual size of 1.08MB → set `maximumError` to `"1.2MB"`), and set
`maximumWarning` to the previous `maximumError` value (`"1MB"`). Re-run
`npm run build` and confirm it now succeeds.

- [ ] **Step 5: Manual smoke test in the browser**

Run: `npm start`, open the app, and verify:
- Signed out: only the sign-in screen appears (no nav, no flash of the
  old content).
- Clicking "Sign in with Google" opens the Google popup and, after
  choosing an account, shows the app's nav and an empty "no shopping
  lists yet" state.
- Creating a category, unit, product, and shopping list each persist
  (visible in the Firebase Console's Firestore data view for this user's
  `users/{uid}/...` paths and the top-level `shoppingLists` collection).
- Reloading the page keeps you signed in and keeps the data (Firestore's
  persistent local cache — and, once you're back online, the same data
  from the server).
- "Sign out" returns to the sign-in screen and the previous list of
  categories/products/units/shopping-lists is no longer visible.
- Run an accessibility check (AXE, matching the project's existing
  requirement) on the sign-in screen and the signed-in nav with the new
  sign-out button.

- [ ] **Step 6: Deploy Firestore rules (already done in Task 3, confirm current)**

Run: `npx -y firebase-tools@latest deploy --only firestore:rules --dry-run`
Expected: compiles successfully with no diff surprises (Task 3 already
deployed the corrected rule; this is a final confirmation, not a new
change).

- [ ] **Step 7: Build and deploy to Firebase Hosting**

Run:
```bash
npm run build
npx -y firebase-tools@latest deploy --only hosting
```
Expected: `Deploy complete!` with the same Hosting URL used previously
(`https://listify-9658c.web.app`).

- [ ] **Step 8: Final commit (if Steps 3-4 produced any fixes)**

```bash
git add -A
git commit -m "chore: fix lint findings and bundle budget after Firestore integration"
```

Skip this step if Steps 3-4 required no changes.
