# Firestore Integration — Design Spec

Date: 2026-09-26

## Problem

Listify is a fully client-side SPA (Angular 22, standalone components,
signals) with no backend — all data (`categories`, `products`, `units`,
`shopping-lists`) lives only in `localStorage`
(`core/storage/local-storage-collection.ts`), scoped to a single browser on a
single device. There is no user account, no cross-device sync, and no way to
eventually share a shopping list with someone else.

A Firestore database (`(default)`, Standard/Native mode) already exists for
the `listify-9658c` project, with security rules deployed
(`firestore.rules`, commit `a0b9f27`) designed for this exact data shape:
`users/{uid}/categories|products|units` (private per user) and a top-level
`shoppingLists/{listId}` collection carrying `ownerId`/`memberIds` so a list
can later be shared. This spec covers wiring the Angular app up to that
database.

## Goals

- Replace the `localStorage` persistence layer with Firestore, scoped per
  signed-in user, for all four collections.
- Add Firebase Authentication (Google Sign-In) and gate the whole app behind
  it, since every collection is now user-scoped.
- Keep the change to the four feature services and their consuming
  components as small as possible by preserving the existing
  `items()/add()/update()/remove()` service surface.
- Prepare the `ShoppingList` model for future sharing (`ownerId`,
  `memberIds`) without building the sharing UI itself.

## Non-goals

- Firebase App Hosting / SSR. The app stays a static SPA on classic Firebase
  Hosting — App Hosting requires the Blaze plan and a live Cloud Run
  container for no benefit here, since there's no SSR need.
- Migrating existing `localStorage` data into Firestore. Confirmed with the
  user: users start fresh in Firestore; old `localStorage` data is left
  untouched (and effectively orphaned).
- Building the actual "share this list with another user" UI/flow. Only the
  data model (`ownerId`/`memberIds`) is prepared for it.
- Anonymous auth, email/password auth, or any provider besides Google
  Sign-In.
- `@angular/fire`. See [Decisions](#decisions).

## Decisions

Settled with the user before/during design:

| Question | Decision |
|---|---|
| Deploy target | Stay on classic Firebase Hosting (already working, free CDN) — not App Hosting |
| Auth provider | Google Sign-In (`firebase.json` already has branding configured for it) |
| Existing `localStorage` data | No migration — ignored |
| Data-layer approach | Drop-in Firestore-backed collection factory behind the existing `LocalStorageCollection`-shaped interface (Approach A), not a full async rewrite of the four services (Approach B), not a `localStorage`-as-cache hybrid (Approach C) |
| Firebase SDK | Raw modular `firebase/app`, `firebase/auth`, `firebase/firestore` (already a dependency) — **not** `@angular/fire`, to avoid an extra package and an unverified Angular-22 peer-dependency range. The signal-based wrapping this spec builds (`AuthService`, `createFirestoreCollection`) is exactly what `@angular/fire` would otherwise provide |

## Architecture

Firebase is initialized once via a small `provideFirebase()` helper (a plain
array of providers, added to `app.config.ts`'s `providers`), calling
`initializeApp(environment.firebase)`, `getAuth(app)`, and
`initializeFirestore(app, { localCache: persistentLocalCache() })`. The
persistent local cache is a deliberate small addition: the app is already a
PWA (`provideServiceWorker` is configured), and a shopping list is
realistically used with spotty in-store connectivity, so surviving a reload
while offline is worth the one extra config option.

`environment.ts` gets the project's public Web SDK config (fetched via
`firebase apps:sdkconfig WEB <appId>`) — this config is not a secret, it's
meant to be embedded in client bundles; access control is entirely enforced
by `firestore.rules`, not by hiding this config.

## Auth & app gating

### `core/auth/auth.service.ts` (new, `@Service()`)

```ts
readonly user: Signal<User | null | undefined>; // undefined = resolving, null = signed out
readonly uid: Signal<string | null>; // derived, computed()
signInWithGoogle(): Promise<void>;   // signInWithPopup + GoogleAuthProvider
signOut(): Promise<void>;
```

`user` is populated from `onAuthStateChanged`, wrapped as a signal directly
(no RxJS): a `signal<User | null | undefined>(undefined)` set inside the
`onAuthStateChanged` callback, registered once as a field initializer
(same injection-context constraint `createLocalStorageCollection` already
relies on).

### `core/auth/sign-in-screen/sign-in-screen.ts` (new)

A small standalone component: logo/title + one "Sign in with Google" button
calling `authService.signInWithGoogle()`. Follows the existing page style
(reuses button classes already in the codebase, e.g. `btn-accent-pill-lg`).

### `app.ts` / `app.html` (extended)

Root template branches on `auth.user()`:

- `undefined` → a minimal loading state (no layout shift once resolved).
- `null` → `<app-sign-in-screen />` only, no nav, no router-outlet.
- a `User` → today's layout (nav + `router-outlet`) unchanged, plus a small
  user menu (avatar-less: display name/initial + "Sign out" button) next to
  the existing `LanguageSwitcher` in the nav.

No changes to `app.routes.ts` and no route guards — with only four feature
routes and the entire app being private, branching once at the root is
simpler than guarding each route.

## Data layer

### `core/storage/firestore-collection.ts` (new)

One generic factory, shaped exactly like today's `LocalStorageCollection<T>`:

```ts
export interface FirestoreCollection<T> {
  readonly items: Signal<readonly T[]>;
  add(item: T): void;
  update(id: string, changes: Partial<T>): void;
  remove(id: string): void;
}

export function createFirestoreCollection<T extends { id: string }>(config: {
  query: (uid: string) => Query<DocumentData>;
  docPath: (uid: string, id: string) => string;
}): FirestoreCollection<T>;
```

Internally:

- An `effect()` (with `onCleanup`) re-subscribes an `onSnapshot()` listener
  on `config.query(uid)` whenever `authService.uid()` changes, writing
  results into a local `signal<readonly T[]>`; when `uid` becomes `null`
  (signed out), it unsubscribes and clears the signal to `[]`.
- `add`/`update`/`remove` resolve `config.docPath(uid, id)` and call
  `setDoc`/`updateDoc`/`deleteDoc`, **fire-and-forget** (not awaited by the
  caller, matching today's synchronous service methods). Firestore's local
  cache applies the write optimistically, so the `items` signal (and any
  `computed()` derived from it) updates immediately, before the server
  round-trip — preserving today's UX (e.g. `addList()` navigating to the new
  list's detail page right after calling `add`).
- A rejected write is caught and reported via the existing
  `ConfirmDialogService.alert(...)` (new i18n keys, e.g.
  `errors.saveFailedTitle` / `errors.saveFailedMessage`) — generic, not
  per-field, to keep the method signatures synchronous and unchanged.

The `{ query, docPath }` shape covers both cases needed:

- `users/{uid}/categories|products|units`: `query: (uid) => collection(firestore, \`users/${uid}/categories\`)`, `docPath: (uid, id) => \`users/${uid}/categories/${id}\``.
- `shoppingLists`: `query: (uid) => query(collection(firestore, 'shoppingLists'), where('memberIds', 'array-contains', uid))`, `docPath: (uid, id) => \`shoppingLists/${id}\``.

### Feature services (extended, minimal diff)

- `categories.service.ts`, `products.service.ts`, `units.service.ts`: swap
  `createLocalStorageCollection<T>('listify:x')` for
  `createFirestoreCollection<T>({ query, docPath })` with the paths above.
  No other change — `add`/`update`/`remove`/the exposed signal keep their
  names and signatures.
- `shopping-lists.service.ts`: same swap, plus `AuthService` injected so
  `addList()` and `importList()` populate the two new `ShoppingList` fields:

  ```ts
  ownerId: this.authService.uid()!,
  memberIds: [this.authService.uid()!],
  ```

  (Safe to assume non-null: these methods are only reachable from UI that
  only renders once the user is signed in.) No other method changes —
  `setStatus`, `rename`, `addItemFromProduct`, `setItemPurchased`,
  `updateItem`, `removeItem` all still read-modify-write the whole `items`
  array on the document, which is exactly the shape `firestore.rules`
  already validates.

### `shopping-list.model.ts` (extended)

```ts
export interface ShoppingList {
  id: string;
  name: string;
  createdAt: string;
  status: 'active' | 'completed';
  ownerId: string;
  memberIds: string[];
  items: ShoppingListItem[];
}
```

### `firestore.rules` (one correction)

`shoppingLists.createdAt` was specified as Firestore `timestamp`, but the
app's model and `DatePipe` binding already use an ISO string
(`new Date().toISOString()`), and adding a Firestore data-converter just for
one field is unwarranted complexity. Change the validator to a string with a
format check (the same `isValidDateString`-style regex documented in the
`firestore-rules-creation` skill: format only, not logical-date validity —
an accepted, documented limitation). No other rule changes. Redeploy after
editing.

## Error handling

- Any failed write (permission denied, offline past the local cache's
  ability to queue, etc.) surfaces as a generic
  `confirmDialogService.alert(...)` — "Couldn't save your changes" — without
  changing any method's synchronous signature.
- Auth popup errors (e.g. user closes the Google popup) are caught in
  `AuthService.signInWithGoogle()` and swallowed silently (same treatment as
  the existing `navigator.share` cancellation handling) — the sign-in screen
  simply stays visible for another attempt.
- No special handling for "signed in but Firestore read fails" beyond what
  `onSnapshot`'s error callback already gives us: report once via the same
  alert and leave `items` at its last-known value (empty on first failure).

## Accessibility

- `SignInScreen` button uses visible text (not icon-only); focus lands on it
  by default when the screen first renders (matches the project's existing
  focus-management pattern for panels, e.g. `fab-panel`).
- The root-level branch between loading/sign-in/app content does not trap
  focus or hide content behind `inert` incorrectly — verified manually per
  the project's AXE-check requirement, same as every other change.
- User menu's "Sign out" is a labeled button, not icon-only, consistent with
  the rest of the nav.

## Testing

- Existing service `*.spec.ts` files (`categories.service.spec.ts`,
  `products.service.spec.ts`, `units.service.spec.ts`,
  `shopping-lists.service.spec.ts`) currently exercise `localStorage`
  behavior directly; they need to move to exercising
  `createFirestoreCollection` against the already-configured Firebase
  Emulator Suite (`firestore` on `8080`, `auth` on `9099` in `firebase.json`)
  rather than mocking the Firestore SDK, since a mock would mostly just
  re-assert the implementation.
- New `npm run test:integration` script wraps the existing test runner with
  `firebase emulators:exec --only firestore,auth`, so these tests are opt-in
  and don't slow down or destabilize the default `npm test` run. Exact
  wiring (test file layout, per-test auth/uid fixtures, emulator project
  config) is left to the implementation plan.
- `firestore.rules` itself gets no dedicated rules-unit-tests in this pass
  (out of scope) — the existing manual "devil's advocate" review plus the
  emulator-backed integration tests above are the coverage for this
  iteration.
- `AuthService` and `SignInScreen`: unit-testable against the emulator's
  Auth instance the same way, or with a thin fake `Auth`/`User` for the
  purely-presentational branching in `App`'s template.

## Risks / open questions

- `firebase`'s modular SDK tree-shaking/bundle size impact on the existing
  Angular budget (`500kB` initial warning / `1MB` error in
  `angular.json`) is unverified — may need a budget adjustment once
  `initializeApp`/`getAuth`/`initializeFirestore` are actually in the
  initial bundle. To be measured during implementation, not guessed here.
- Firebase Emulator Suite integration testing (`firebase emulators:exec`)
  adds a new moving part to the test setup; if it proves too heavy during
  implementation, the fallback is documenting a manual "start emulators,
  then run tests" step instead of a fully automated `npm` script.
