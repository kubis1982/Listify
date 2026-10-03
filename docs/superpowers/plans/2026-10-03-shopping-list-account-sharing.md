# Shopping List Sharing Between Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner of a shopping list share it with other Google accounts through a reusable invite link, with live co-editing.

**Architecture:** Lists move to a top-level `shoppingLists/{listId}` collection carrying `ownerId` / `memberIds` / `memberNames`; each user's lists come from an `array-contains` query. Items are stored as a map keyed by item id so each edit writes only its own item. Joining is a client-side batch (`joins/{uid}` + `arrayUnion`) that `firestore.rules` verifies with `getAfter()` against an owner-only `invite/current` token.

**Tech Stack:** Angular 22 (standalone, signals, `@Service()`, CDK Dialog), Firebase JS SDK 12 (Firestore + Auth), Vitest via `@angular/build:unit-test`, Firebase Emulator Suite.

**Spec:** `docs/superpowers/specs/2026-10-03-shopping-list-account-sharing-design.md`

## Global Constraints

- Follow `CLAUDE.md`: standalone components without `standalone: true`, no explicit `OnPush`, `input()`/`output()`, signals + `computed()`, native control flow, `inject()`, `@Service()` for new singletons, no `ngClass`/`ngStyle`/`CommonModule`.
- Every user-visible string goes through `I18n.t` and gets an entry in both `src/app/core/i18n/translations/en.ts` and `pl.ts` (`pl` is typed `Record<TranslationKey, string>`, so a missing key fails compilation).
- No new npm dependencies (no `@firebase/rules-unit-testing`).
- Emulator-backed specs must *run* (not be skipped) and pass before `firestore.rules` is deployed. The rules are never deployed as part of this plan; deployment is the project owner's call.
- Max 20 members per list (`memberIds.size() <= 20`); member display name 1–100 chars; invite token 32–64 chars (`crypto.randomUUID()` = 36).
- Files under `src/app/testing/` and other non-spec files must not reference Vitest globals (`expect`, `vi`): `tsconfig.app.json` type-checks every non-spec `.ts` file under `src/` with `types: []`.
- Commits: Conventional Commits; every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## How to run tests

- Unit tests only: `npx ng test --watch=false` (emulator specs are skipped automatically when the emulator is down).
- One spec: `npx ng test --watch=false --include <path-to-spec>`.
- Emulator specs: start emulators in a separate terminal with `npm run emulators` (it hot-reloads `firestore.rules` on save), then run the spec with `--include`. **Check the output says the tests passed, not "skipped".**
- Full gate: `firebase emulators:exec --only firestore,auth "npx ng test --watch=false"`.

## Deviations from the spec (decided while planning)

1. **`ShoppingListsStore` instead of field paths in `FirestoreCollection.update`.** `ShoppingListsService` talks to a small domain store (`putItem`, `removeItem`, …). Only its Firestore implementation knows about field paths, so the in-memory fake used by component specs stays trivial. `createFirestoreCollection` still gains `fromFirestore`/`toFirestore` and an `updateFields()` escape hatch, as the spec says.
2. **Whole-item writes (`items.{id}` = full item).** The spec mentioned per-field writes (`items.{id}.purchased`). If a member deletes an item while another checks it, a per-field write recreates a broken partial item (`{ purchased: true }` with no name). A whole-item write resurrects a complete item instead. Different items never conflict either way.
3. **Sharing service never throws.** It reports unexpected errors through the existing generic alert and returns `null` / `false` / `'failed'`, so components only branch on results.

## Review Focus

1. **Signed-out user opens an invite link** → after Google sign-in the join must still run (URL survives the sign-in gate). Pinned in Task 8 (`app.spec.ts`).
2. **Owner opens their own invite link** → `already-member` and lands on the list, no write attempted. Pinned in Task 5.
3. **Member is removed (or the owner deletes the list) while the member has it open** → the detail page switches live to "List not found" instead of showing stale data. Pinned in Task 7.
4. **Two people edit different items at the same moment** → both changes survive. Pinned in Task 2 (rules spec, real emulator).
5. **Google account without a display name, or with a very long one** → the join still satisfies the 1–100 char rule (falls back to e-mail, truncates). Pinned in Task 4 (`toDisplayName`).

---

### Task 1: Emulator test helpers + rules for the list document

**Files:**
- Create: `src/app/testing/firebase-emulator.ts`
- Modify: `firestore.rules`
- Create: `src/app/core/firebase/firestore-rules.spec.ts`

**Interfaces:**
- Produces (used by Tasks 2, 3, 4, 5):
  - `isFirestoreEmulatorReachable(): Promise<boolean>`
  - `interface EmulatorUser { app: FirebaseApp; auth: Auth; firestore: Firestore; user: User; uid: string }`
  - `createEmulatorUser(displayName?: string): Promise<EmulatorUser>`
  - `disposeEmulatorUser(user: EmulatorUser): Promise<void>`
  - `errorCode(operation: Promise<unknown>): Promise<string | null>` (null = succeeded)
  - `shoppingListDoc(owner: EmulatorUser, overrides?: Record<string, unknown>): { id: string } & Record<string, unknown>`

- [ ] **Step 1: Write the helper module**

`src/app/testing/firebase-emulator.ts`:

```ts
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

// Must match the project id the emulator runs under (see firebase.json
// singleProjectMode), otherwise reads and writes land in a different
// emulated database than the one firestore.rules is loaded into.
const EMULATOR_PROJECT_ID = 'listify-9658c';

export async function isFirestoreEmulatorReachable(): Promise<boolean> {
  try {
    await fetch('http://127.0.0.1:8080/');
    return true;
  } catch {
    return false;
  }
}

export interface EmulatorUser {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly firestore: Firestore;
  readonly user: User;
  readonly uid: string;
}

/**
 * Signs up a fresh account against the Auth emulator in its own FirebaseApp,
 * so several users can act concurrently in one spec (each app keeps its own
 * auth state and Firestore client).
 */
export async function createEmulatorUser(displayName = 'Test User'): Promise<EmulatorUser> {
  const app = initializeApp(
    { projectId: EMULATOR_PROJECT_ID, apiKey: 'test-key' },
    `test-${crypto.randomUUID()}`,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);

  const credential = await createUserWithEmailAndPassword(
    auth,
    `${crypto.randomUUID()}@example.com`,
    'Test1234!',
  );
  await updateProfile(credential.user, { displayName });
  return { app, auth, firestore, user: credential.user, uid: credential.user.uid };
}

export async function disposeEmulatorUser(user: EmulatorUser): Promise<void> {
  await signOut(user.auth);
  await deleteApp(user.app);
}

/** Resolves to the Firestore error code of a rejected operation, or null if it succeeded. */
export async function errorCode(operation: Promise<unknown>): Promise<string | null> {
  try {
    await operation;
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

/** A valid `shoppingLists/{id}` document owned by `owner`, as firestore.rules expects it. */
export function shoppingListDoc(
  owner: EmulatorUser,
  overrides: Record<string, unknown> = {},
): { id: string } & Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    name: 'Groceries',
    createdAt: new Date().toISOString(),
    status: 'active',
    items: {},
    ownerId: owner.uid,
    memberIds: [owner.uid],
    memberNames: { [owner.uid]: 'Owner' },
    ...overrides,
  } as { id: string } & Record<string, unknown>;
}
```

- [ ] **Step 2: Write the failing rules spec**

`src/app/core/firebase/firestore-rules.spec.ts`:

```ts
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  createEmulatorUser,
  disposeEmulatorUser,
  errorCode,
  isFirestoreEmulatorReachable,
  shoppingListDoc,
  type EmulatorUser,
} from '../../testing/firebase-emulator';

const emulatorAvailable = await isFirestoreEmulatorReachable();

const MILK = {
  id: 'item-a',
  productName: 'Milk',
  unitLabel: 'l',
  categoryName: 'Dairy',
  quantity: 1,
  purchased: false,
};

describe.skipIf(!emulatorAvailable)('firestore.rules — shoppingLists (owner)', () => {
  let owner: EmulatorUser;
  let stranger: EmulatorUser;

  beforeAll(async () => {
    owner = await createEmulatorUser('Owner');
    stranger = await createEmulatorUser('Stranger');
  });

  afterAll(async () => {
    await disposeEmulatorUser(owner);
    await disposeEmulatorUser(stranger);
  });

  async function createList(): Promise<string> {
    const data = shoppingListDoc(owner);
    await setDoc(doc(owner.firestore, 'shoppingLists', data.id), data);
    return data.id;
  }

  it('lets a user create a list they own and read it back', async () => {
    const id = await createList();

    const snapshot = await getDoc(doc(owner.firestore, 'shoppingLists', id));

    expect(snapshot.data()?.['ownerId']).toBe(owner.uid);
  });

  it('accepts a non-empty items map on create (the array version of this broke production)', async () => {
    const data = shoppingListDoc(owner, { items: { [MILK.id]: MILK } });

    expect(await errorCode(setDoc(doc(owner.firestore, 'shoppingLists', data.id), data))).toBeNull();
  });

  it('denies creating a list owned by someone else', async () => {
    const data = shoppingListDoc(owner);

    expect(await errorCode(setDoc(doc(stranger.firestore, 'shoppingLists', data.id), data))).toBe(
      'permission-denied',
    );
  });

  it('denies creating a list that already includes other members', async () => {
    const data = shoppingListDoc(owner, {
      memberIds: [owner.uid, stranger.uid],
      memberNames: { [owner.uid]: 'Owner', [stranger.uid]: 'Stranger' },
    });

    expect(await errorCode(setDoc(doc(owner.firestore, 'shoppingLists', data.id), data))).toBe(
      'permission-denied',
    );
  });

  it('returns the list to its owner through the array-contains query', async () => {
    const id = await createList();

    const snapshot = await getDocs(
      query(collection(owner.firestore, 'shoppingLists'), where('memberIds', 'array-contains', owner.uid)),
    );

    expect(snapshot.docs.map((d) => d.id)).toContain(id);
  });

  it('denies a stranger reading the list directly', async () => {
    const id = await createList();

    expect(await errorCode(getDoc(doc(stranger.firestore, 'shoppingLists', id)))).toBe(
      'permission-denied',
    );
  });

  it("denies a stranger querying for someone else's lists", async () => {
    await createList();

    const strangerQuery = query(
      collection(stranger.firestore, 'shoppingLists'),
      where('memberIds', 'array-contains', owner.uid),
    );

    expect(await errorCode(getDocs(strangerQuery))).toBe('permission-denied');
  });

  it('lets the owner write a single item by field path', async () => {
    const id = await createList();
    const ref = doc(owner.firestore, 'shoppingLists', id);

    expect(await errorCode(updateDoc(ref, { [`items.${MILK.id}`]: MILK }))).toBeNull();
    expect((await getDoc(ref)).data()?.['items']).toEqual({ [MILK.id]: MILK });
  });

  it('denies the owner handing the list over by changing ownerId', async () => {
    const id = await createList();

    const handOver = updateDoc(doc(owner.firestore, 'shoppingLists', id), {
      ownerId: stranger.uid,
      memberIds: [stranger.uid],
      memberNames: { [stranger.uid]: 'Stranger' },
    });

    expect(await errorCode(handOver)).toBe('permission-denied');
  });

  it('lets only the owner delete the list', async () => {
    const id = await createList();

    expect(await errorCode(deleteDoc(doc(stranger.firestore, 'shoppingLists', id)))).toBe(
      'permission-denied',
    );
    expect(await errorCode(deleteDoc(doc(owner.firestore, 'shoppingLists', id)))).toBeNull();
  });

  it('denies everything under the legacy users/{uid}/shoppingLists path', async () => {
    const legacy = doc(owner.firestore, `users/${owner.uid}/shoppingLists/legacy`);

    expect(await errorCode(getDoc(legacy))).toBe('permission-denied');
    expect(await errorCode(setDoc(legacy, { id: 'legacy' }))).toBe('permission-denied');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Start `npm run emulators` in another terminal, then:
Run: `npx ng test --watch=false --include src/app/core/firebase/firestore-rules.spec.ts`
Expected: tests RUN (not skipped) and most FAIL with `permission-denied` (no `shoppingLists` match exists yet); the legacy-path test fails because the old match still allows the owner.

- [ ] **Step 4: Update `firestore.rules`**

In the header comment, replace the `users/{userId}/shoppingLists/{listId}` block with:

```
// Collection: shoppingLists/{listId}   (top-level, shared between accounts)
// Fields:
//   - id: string (required, immutable, must equal listId)
//   - name: string (required, 1-200 chars)
//   - createdAt: string (required, immutable, ISO 8601 format)
//   - status: string (required, one of 'active' | 'completed')
//   - items: map<itemId, item> (required, 0-500 entries). Per-item shape is
//     enforced by the TypeScript layer — see isValidItemsMap.
//   - ownerId: string (required, immutable)
//   - memberIds: list<string> (required, 1-20 entries, contains ownerId)
//   - memberNames: map<uid, string> (required, keys == memberIds)
//
// Subcollections (added in a later step):
//   - shoppingLists/{listId}/invite/current  { token } — owner only
//   - shoppingLists/{listId}/joins/{uid}     { token } — proof of invite
//
// users/{userId}/shoppingLists is the pre-sharing location; it is no longer
// used and is explicitly denied.
```

Also update the NOTE paragraph at the top: replace "Sharing a shopping list between users is out of scope for now." with "Shopping lists live in a top-level collection and can be shared with other accounts through an invite link."

Replace `isValidItemsList` and `isValidShoppingList` with:

```
    // The .all(entry, ...) macro silently fails at the real Firestore rules
    // engine (confirmed against production for the former items array), so
    // per-item field validation stays in the TypeScript layer; only the
    // map's type and overall size are checked here.
    function isValidItemsMap(items) {
      return items is map && items.size() <= 500;
    }

    function isValidMemberIds(memberIds, ownerId) {
      return memberIds is list &&
        memberIds.size() >= 1 && memberIds.size() <= 20 &&
        memberIds.toSet().size() == memberIds.size() &&
        ownerId in memberIds;
    }

    function isValidMemberNames(memberNames, memberIds) {
      return memberNames is map &&
        memberNames.keys().hasOnly(memberIds) &&
        memberNames.size() == memberIds.size();
    }

    function isValidShoppingList(data, listId) {
      return hasOnlyAllowedFields(data, ['id', 'name', 'createdAt', 'status', 'items', 'ownerId', 'memberIds', 'memberNames']) &&
        hasRequiredFields(data, ['id', 'name', 'createdAt', 'status', 'items', 'ownerId', 'memberIds', 'memberNames']) &&
        data.id is string && data.id == listId &&
        validStringLength(data.name, 1, 200) &&
        isValidDateString(data.createdAt) &&
        data.status in ['active', 'completed'] &&
        isValidItemsMap(data.items) &&
        data.ownerId is string &&
        isValidMemberIds(data.memberIds, data.ownerId) &&
        isValidMemberNames(data.memberNames, data.memberIds);
    }
```

Inside `match /users/{userId}`, replace the whole `match /shoppingLists/{listId} { ... }` block with:

```
      match /shoppingLists/{document=**} {
        allow read, write: if false;
      }
```

After the closing brace of `match /users/{userId}`, add:

```
    match /shoppingLists/{listId} {

      function isListMember() {
        return isAuthenticated() && request.auth.uid in resource.data.memberIds;
      }

      function isListOwner() {
        return isAuthenticated() && resource.data.ownerId == request.auth.uid;
      }

      function changedKeys() {
        return request.resource.data.diff(resource.data).affectedKeys();
      }

      // Owner may edit anything except the immutable fields, and may only
      // shrink the member list (remove people), never add arbitrary uids.
      function isOwnerUpdate() {
        return isListOwner() &&
          areImmutableFieldsUnchanged(['id', 'createdAt', 'ownerId']) &&
          request.resource.data.memberIds.toSet().difference(resource.data.memberIds.toSet()).size() == 0;
      }

      function isMemberUpdate() {
        return isListMember() && changedKeys().hasOnly(['items', 'status']);
      }

      allow read: if isListMember();
      allow create: if isAuthenticated() &&
        isValidShoppingList(request.resource.data, listId) &&
        request.resource.data.ownerId == request.auth.uid &&
        request.resource.data.memberIds == [request.auth.uid];
      allow update: if isValidShoppingList(request.resource.data, listId) &&
        (isOwnerUpdate() || isMemberUpdate());
      allow delete: if isListOwner();
    }
```

- [ ] **Step 5: Run the spec to verify it passes**

Run: `npx ng test --watch=false --include src/app/core/firebase/firestore-rules.spec.ts`
Expected: all 11 tests PASS (none skipped). If the emulator printed a rules compile error, fix it first; it logs to the emulator terminal.

- [ ] **Step 6: Commit**

```bash
git add src/app/testing/firebase-emulator.ts src/app/core/firebase/firestore-rules.spec.ts firestore.rules
git commit -m "feat(firestore): move shopping lists to a shared top-level collection in rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Rules for invites, joining, leaving and member removal

**Files:**
- Modify: `firestore.rules` (the `match /shoppingLists/{listId}` block from Task 1)
- Modify: `src/app/core/firebase/firestore-rules.spec.ts`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: the write shapes Task 5's service must use exactly:
  - invite: `setDoc(shoppingLists/{id}/invite/current, { token })` by the owner
  - join: one `writeBatch` with `set(joins/{uid}, { token })` + `update(list, { memberIds: arrayUnion(uid), ['memberNames.' + uid]: name })`
  - leave: `update(list, { memberIds: arrayRemove(uid), ['memberNames.' + uid]: deleteField() })` + `delete(joins/{uid})`
  - remove member (owner): the same update for `memberId` + `delete(joins/{memberId})` (+ optional `set(invite/current, { token: new })`)

- [ ] **Step 1: Add the failing tests**

Append to `firestore-rules.spec.ts` (and extend the `firebase/firestore` import with `arrayRemove, arrayUnion, deleteField, writeBatch`):

```ts
describe.skipIf(!emulatorAvailable)('firestore.rules — shoppingLists (sharing)', () => {
  let owner: EmulatorUser;
  let member: EmulatorUser;
  let stranger: EmulatorUser;

  beforeAll(async () => {
    owner = await createEmulatorUser('Owner');
    member = await createEmulatorUser('Member');
    stranger = await createEmulatorUser('Stranger');
  });

  afterAll(async () => {
    await disposeEmulatorUser(owner);
    await disposeEmulatorUser(member);
    await disposeEmulatorUser(stranger);
  });

  function listRef(user: EmulatorUser, listId: string) {
    return doc(user.firestore, 'shoppingLists', listId);
  }

  async function createList(): Promise<string> {
    const data = shoppingListDoc(owner);
    await setDoc(listRef(owner, data.id), data);
    return data.id;
  }

  async function setInvite(listId: string, token = crypto.randomUUID()): Promise<string> {
    await setDoc(doc(owner.firestore, `shoppingLists/${listId}/invite/current`), { token });
    return token;
  }

  function join(user: EmulatorUser, listId: string, token: string, uidToAdd = user.uid): Promise<void> {
    const batch = writeBatch(user.firestore);
    batch.set(doc(user.firestore, `shoppingLists/${listId}/joins/${user.uid}`), { token });
    batch.update(listRef(user, listId), {
      memberIds: arrayUnion(uidToAdd),
      [`memberNames.${uidToAdd}`]: 'Joined',
    });
    return batch.commit();
  }

  async function sharedList(): Promise<string> {
    const listId = await createList();
    await join(member, listId, await setInvite(listId));
    return listId;
  }

  describe('invite/current', () => {
    it('lets the owner write and read the token', async () => {
      const listId = await createList();
      const token = await setInvite(listId);

      const snapshot = await getDoc(doc(owner.firestore, `shoppingLists/${listId}/invite/current`));

      expect(snapshot.data()).toEqual({ token });
    });

    it('denies members and strangers reading the token', async () => {
      const listId = await sharedList();

      for (const user of [member, stranger]) {
        expect(await errorCode(getDoc(doc(user.firestore, `shoppingLists/${listId}/invite/current`)))).toBe(
          'permission-denied',
        );
      }
    });
  });

  describe('joining', () => {
    it('lets a user join with the current token, then read and query the list', async () => {
      const listId = await createList();
      const token = await setInvite(listId);

      expect(await errorCode(join(member, listId, token))).toBeNull();
      expect((await getDoc(listRef(member, listId))).data()?.['memberIds']).toEqual([owner.uid, member.uid]);
      const mine = await getDocs(
        query(collection(member.firestore, 'shoppingLists'), where('memberIds', 'array-contains', member.uid)),
      );
      expect(mine.docs.map((d) => d.id)).toContain(listId);
    });

    it('denies joining with a wrong token', async () => {
      const listId = await createList();
      await setInvite(listId);

      expect(await errorCode(join(member, listId, crypto.randomUUID()))).toBe('permission-denied');
    });

    it('denies joining a list that has no invite yet', async () => {
      const listId = await createList();

      expect(await errorCode(join(member, listId, crypto.randomUUID()))).toBe('permission-denied');
    });

    it('denies joining with a token that was regenerated away', async () => {
      const listId = await createList();
      const oldToken = await setInvite(listId);
      await setInvite(listId);

      expect(await errorCode(join(member, listId, oldToken))).toBe('permission-denied');
    });

    it("denies adding someone else's uid, even with a valid token", async () => {
      const listId = await createList();
      const token = await setInvite(listId);

      expect(await errorCode(join(stranger, listId, token, member.uid))).toBe('permission-denied');
    });
  });

  describe('member permissions', () => {
    it('lets a member write items and change status', async () => {
      const listId = await sharedList();

      expect(await errorCode(updateDoc(listRef(member, listId), { [`items.${MILK.id}`]: MILK }))).toBeNull();
      expect(await errorCode(updateDoc(listRef(member, listId), { status: 'completed' }))).toBeNull();
    });

    it('keeps both edits when owner and member write different items concurrently', async () => {
      const listId = await sharedList();
      const bread = { ...MILK, id: 'item-b', productName: 'Bread' };

      await Promise.all([
        updateDoc(listRef(owner, listId), { [`items.${MILK.id}`]: MILK }),
        updateDoc(listRef(member, listId), { [`items.${bread.id}`]: bread }),
      ]);

      expect((await getDoc(listRef(owner, listId))).data()?.['items']).toEqual({
        [MILK.id]: MILK,
        [bread.id]: bread,
      });
    });

    it('denies a member renaming, re-owning or deleting the list', async () => {
      const listId = await sharedList();

      expect(await errorCode(updateDoc(listRef(member, listId), { name: 'Mine now' }))).toBe('permission-denied');
      expect(await errorCode(updateDoc(listRef(member, listId), { ownerId: member.uid }))).toBe('permission-denied');
      expect(await errorCode(deleteDoc(listRef(member, listId)))).toBe('permission-denied');
    });

    it('denies a member removing another member', async () => {
      const listId = await sharedList();

      const removeOwner = updateDoc(listRef(member, listId), {
        memberIds: arrayRemove(owner.uid),
        [`memberNames.${owner.uid}`]: deleteField(),
      });

      expect(await errorCode(removeOwner)).toBe('permission-denied');
    });
  });

  describe('leaving and removal', () => {
    it('lets a member leave', async () => {
      const listId = await sharedList();
      const batch = writeBatch(member.firestore);
      batch.update(listRef(member, listId), {
        memberIds: arrayRemove(member.uid),
        [`memberNames.${member.uid}`]: deleteField(),
      });
      batch.delete(doc(member.firestore, `shoppingLists/${listId}/joins/${member.uid}`));

      expect(await errorCode(batch.commit())).toBeNull();
      expect((await getDoc(listRef(owner, listId))).data()?.['memberIds']).toEqual([owner.uid]);
    });

    it('denies the owner leaving their own list', async () => {
      const listId = await sharedList();

      const ownerLeaves = updateDoc(listRef(owner, listId), {
        memberIds: arrayRemove(owner.uid),
        [`memberNames.${owner.uid}`]: deleteField(),
      });

      expect(await errorCode(ownerLeaves)).toBe('permission-denied');
    });

    it('lets the owner remove a member and revoke the link in one batch', async () => {
      const listId = await sharedList();
      const batch = writeBatch(owner.firestore);
      batch.update(listRef(owner, listId), {
        memberIds: arrayRemove(member.uid),
        [`memberNames.${member.uid}`]: deleteField(),
      });
      batch.delete(doc(owner.firestore, `shoppingLists/${listId}/joins/${member.uid}`));
      batch.set(doc(owner.firestore, `shoppingLists/${listId}/invite/current`), { token: crypto.randomUUID() });

      expect(await errorCode(batch.commit())).toBeNull();
      expect(await errorCode(getDoc(listRef(member, listId)))).toBe('permission-denied');
    });

    it('denies the owner adding a uid that never joined', async () => {
      const listId = await createList();

      const forceAdd = updateDoc(listRef(owner, listId), {
        memberIds: arrayUnion(stranger.uid),
        [`memberNames.${stranger.uid}`]: 'Stranger',
      });

      expect(await errorCode(forceAdd)).toBe('permission-denied');
    });
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx ng test --watch=false --include src/app/core/firebase/firestore-rules.spec.ts`
Expected: Task 1 tests PASS; invite/join/leave tests FAIL with `permission-denied` (no subcollection rules, no join/leave branches yet). "Denies …" tests may already pass.

- [ ] **Step 3: Implement the rules**

In `match /shoppingLists/{listId}`, add these functions after `isMemberUpdate()`:

```
      function invitePath() {
        return /databases/$(database)/documents/shoppingLists/$(listId)/invite/current;
      }

      function joinPath(uid) {
        return /databases/$(database)/documents/shoppingLists/$(listId)/joins/$(uid);
      }

      function isStoredListOwner() {
        return isAuthenticated() &&
          get(/databases/$(database)/documents/shoppingLists/$(listId)).data.ownerId == request.auth.uid;
      }

      function memberNamesDiff() {
        return request.resource.data.memberNames.diff(resource.data.memberNames);
      }

      // A non-member appends exactly their own uid and name, and the same
      // batch must leave behind joins/{uid} carrying the current token.
      function isJoin() {
        return isAuthenticated() &&
          !(request.auth.uid in resource.data.memberIds) &&
          changedKeys().hasOnly(['memberIds', 'memberNames']) &&
          request.resource.data.memberIds == resource.data.memberIds.concat([request.auth.uid]) &&
          memberNamesDiff().affectedKeys().hasOnly([request.auth.uid]) &&
          validStringLength(request.resource.data.memberNames[request.auth.uid], 1, 100) &&
          getAfter(joinPath(request.auth.uid)).data.token == get(invitePath()).data.token;
      }

      function isLeave() {
        return isListMember() &&
          request.auth.uid != resource.data.ownerId &&
          changedKeys().hasOnly(['memberIds', 'memberNames']) &&
          request.resource.data.memberIds == resource.data.memberIds.removeAll([request.auth.uid]) &&
          memberNamesDiff().affectedKeys().hasOnly([request.auth.uid]);
      }
```

Change the update rule to:

```
      allow update: if isValidShoppingList(request.resource.data, listId) &&
        (isOwnerUpdate() || isMemberUpdate() || isJoin() || isLeave());
```

Add the subcollections inside the same block, after `allow delete`:

```
      match /invite/{inviteId} {
        allow read, delete: if inviteId == 'current' && isStoredListOwner();
        allow create, update: if inviteId == 'current' && isStoredListOwner() &&
          hasOnlyAllowedFields(request.resource.data, ['token']) &&
          validStringLength(request.resource.data.token, 32, 64);
      }

      match /joins/{memberId} {
        allow read, delete: if isAuthenticated() &&
          (request.auth.uid == memberId || isStoredListOwner());
        allow create, update: if isAuthenticated() && request.auth.uid == memberId &&
          hasOnlyAllowedFields(request.resource.data, ['token']) &&
          hasRequiredFields(request.resource.data, ['token']) &&
          request.resource.data.token == get(invitePath()).data.token;
      }
```

Also update the header comment's "Subcollections (added in a later step)" line to just "Subcollections:".

- [ ] **Step 4: Run to verify everything passes**

Run: `npx ng test --watch=false --include src/app/core/firebase/firestore-rules.spec.ts`
Expected: all tests PASS, none skipped.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules src/app/core/firebase/firestore-rules.spec.ts
git commit -m "feat(firestore): allow joining shopping lists via invite token in rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `FirestoreErrorReporter` + conversions and `updateFields` in `createFirestoreCollection`

**Files:**
- Create: `src/app/core/storage/firestore-error-reporter.ts`
- Modify: `src/app/core/storage/firestore-collection.ts`
- Modify: `src/app/core/storage/firestore-collection.spec.ts`

**Interfaces:**
- Produces:
  - `@Service() class FirestoreErrorReporter { report(error?: unknown): void }` (console.error + generic "Save failed" alert)
  - `interface FirestoreCollectionConfig<T> { query; docPath; fromFirestore?: (data: DocumentData, id: string) => T; toFirestore?: (item: T) => DocumentData }`
  - `interface FirestoreDocumentCollection<T> extends FirestoreCollection<T> { updateFields(id: string, fields: UpdateData<DocumentData>): void }`
  - `createFirestoreCollection<T>(config: FirestoreCollectionConfig<T>): FirestoreDocumentCollection<T>`

- [ ] **Step 1: Write failing emulator tests**

In `firestore-collection.spec.ts`, add `updateDoc`-free tests at the end of the `describe` block:

```ts
  it('applies toFirestore on add and fromFirestore on read', async () => {
    const categories = TestBed.runInInjectionContext(() =>
      createFirestoreCollection<Category>({
        query: (fs, u) => collection(fs, `users/${u}/categories`),
        docPath: (u, id) => `users/${u}/categories/${id}`,
        toFirestore: (category) => ({ ...category, name: category.name.trim() }),
        fromFirestore: (data, id) => ({ id, name: `${data['name']}!` }),
      }),
    );

    categories.add({ id: 'cat-1', name: '  Dairy  ' });

    await vi.waitFor(() => {
      expect(categories.items()).toEqual([{ id: 'cat-1', name: 'Dairy!' }]);
    });
  });

  it('writes raw field paths through updateFields()', async () => {
    const categories = createCategories();
    categories.add({ id: 'cat-1', name: 'Dairy' });
    await vi.waitFor(() => expect(categories.items()).toHaveLength(1));

    categories.updateFields('cat-1', { name: 'Bakery' });

    await vi.waitFor(() => {
      expect(categories.items()).toEqual([{ id: 'cat-1', name: 'Bakery' }]);
    });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run (emulators running): `npx ng test --watch=false --include src/app/core/storage/firestore-collection.spec.ts`
Expected: compile errors / FAIL: `toFirestore` not in config type, `updateFields` does not exist.

- [ ] **Step 3: Extract the error reporter**

`src/app/core/storage/firestore-error-reporter.ts`:

```ts
import { inject, Service } from '@angular/core';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { I18n } from '../i18n/i18n.service';

/** Logs a Firestore failure and shows the generic "Save failed" alert. */
@Service()
export class FirestoreErrorReporter {
  private readonly confirmDialogService = inject(ConfirmDialogService);
  private readonly t = inject(I18n).t;

  report(error?: unknown): void {
    if (error !== undefined) {
      console.error('[Firestore]', error);
    }
    void this.confirmDialogService.alert({
      title: this.t('errors.saveFailedTitle'),
      message: this.t('errors.saveFailedMessage'),
    });
  }
}
```

- [ ] **Step 4: Rewrite `firestore-collection.ts`**

```ts
import { effect, inject, signal, Signal } from '@angular/core';
import {
  doc,
  deleteDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Query,
  type UpdateData,
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { AuthService } from '../auth/auth.service';
import { FirestoreErrorReporter } from './firestore-error-reporter';

export interface FirestoreCollection<T> {
  readonly items: Signal<readonly T[]>;
  add(item: T): void;
  update(id: string, changes: Partial<T>): void;
  remove(id: string): void;
}

export interface FirestoreDocumentCollection<T> extends FirestoreCollection<T> {
  /**
   * Writes raw Firestore update data (e.g. dotted field paths, `deleteField()`),
   * bypassing `toFirestore`. For documents whose stored shape differs from `T`.
   */
  updateFields(id: string, fields: UpdateData<DocumentData>): void;
}

export interface FirestoreCollectionConfig<T> {
  query: (firestore: Firestore, uid: string) => Query<DocumentData>;
  docPath: (uid: string, id: string) => string;
  /** Maps a stored document to `T`. Defaults to the document data plus its id. */
  fromFirestore?: (data: DocumentData, id: string) => T;
  /** Maps `T` to the stored document on `add`. Defaults to `T` as-is. */
  toFirestore?: (item: T) => DocumentData;
}

/**
 * Creates a signal-backed collection of items of type `T`, persisted to
 * Firestore under paths derived from the signed-in user's uid. Must be
 * called as a field initializer of an injectable class (uses `effect()`
 * and `inject()`, so it needs an injection context). `Firestore` itself is
 * a plain interface (not a class), so it is injected through the
 * `FIRESTORE` `InjectionToken`.
 *
 * `update()` writes `changes` as-is (no `toFirestore`), so it is only safe
 * for fields whose stored shape equals their shape in `T`.
 */
export function createFirestoreCollection<T extends { id: string }>(
  config: FirestoreCollectionConfig<T>,
): FirestoreDocumentCollection<T> {
  const firestore = inject(FIRESTORE);
  const authService = inject(AuthService);
  const errorReporter = inject(FirestoreErrorReporter);
  const reportError = (error?: unknown) => errorReporter.report(error);
  const fromFirestore =
    config.fromFirestore ?? ((data: DocumentData, id: string): T => ({ ...(data as T), id }));
  const toFirestore = config.toFirestore ?? ((item: T): DocumentData => item as DocumentData);

  const items = signal<readonly T[]>([]);

  function docRef(uid: string, id: string): DocumentReference<DocumentData, DocumentData> {
    return doc(firestore, config.docPath(uid, id));
  }

  /** Runs `write` for the signed-in user, routing every failure to the reporter. */
  function write(run: (uid: string) => Promise<void>): void {
    const uid = authService.uid();
    if (!uid) {
      reportError();
      return;
    }
    try {
      run(uid).catch(reportError);
    } catch (error) {
      reportError(error);
    }
  }

  effect((onCleanup) => {
    const uid = authService.uid();
    if (!uid) {
      items.set([]);
      return;
    }
    const unsubscribe = onSnapshot(
      config.query(firestore, uid),
      (snapshot) => {
        items.set(snapshot.docs.map((d) => fromFirestore(d.data(), d.id)));
      },
      (error) => reportError(error),
    );
    onCleanup(unsubscribe);
  });

  return {
    items: items.asReadonly(),
    add: (item: T) => write((uid) => setDoc(docRef(uid, item.id), toFirestore(item))),
    update: (id: string, changes: Partial<T>) =>
      write((uid) => updateDoc(docRef(uid, id), changes as UpdateData<DocumentData>)),
    updateFields: (id: string, fields: UpdateData<DocumentData>) =>
      write((uid) => updateDoc(docRef(uid, id), fields)),
    remove: (id: string) => write((uid) => deleteDoc(docRef(uid, id))),
  };
}
```

- [ ] **Step 5: Run the collection spec and the whole unit suite**

Run (emulators running): `npx ng test --watch=false --include src/app/core/storage/firestore-collection.spec.ts`
Expected: all PASS, including the existing "never reflects a write rejected by firestore.rules" test (the alert now comes from `FirestoreErrorReporter`, which still calls `ConfirmDialogService.alert`).
Run: `npx ng test --watch=false`
Expected: PASS (categories/products/units callers compile unchanged; `T` is inferred from their explicit type argument).

- [ ] **Step 6: Commit**

```bash
git add src/app/core/storage/
git commit -m "feat(firestore): support stored-shape conversions and raw field updates in collections

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Shared list model, map-based items, `ShoppingListsStore` and service

**Files:**
- Modify: `src/app/core/auth/auth.service.ts`, `src/app/core/auth/auth.service.spec.ts`
- Modify: `src/app/testing/fake-auth-service.ts`
- Modify: `src/app/features/shopping-lists/data/shopping-list.model.ts`
- Create: `src/app/features/shopping-lists/data/shopping-list-firestore.ts` + `.spec.ts`
- Create: `src/app/features/shopping-lists/data/shopping-lists.store.ts` + `.spec.ts` (emulator)
- Create: `src/app/testing/in-memory-shopping-lists-store.ts`
- Modify: `src/app/features/shopping-lists/data/shopping-lists.service.ts` + `.spec.ts`
- Modify (fixtures/providers only): `shopping-list-export.spec.ts`, `shopping-list-detail.spec.ts`, `shopping-lists-overview.spec.ts`

**Interfaces:**
- Consumes: Task 3 `createFirestoreCollection` with `fromFirestore`/`toFirestore`/`updateFields`.
- Produces:
  - `toDisplayName(user: Pick<User, 'displayName' | 'email'> | null | undefined): string` and `AuthService.displayName: Signal<string>`
  - `ShoppingList` gains `ownerId: string; memberIds: string[]; memberNames: Record<string, string>`
  - `shoppingListToFirestore(list: ShoppingList): DocumentData`, `shoppingListFromFirestore(data: DocumentData, id: string): ShoppingList`
  - `interface ShoppingListsStore { lists; addList(list); updateList(id, changes: Partial<Pick<ShoppingList, 'name' | 'status'>>); removeList(id); putItem(listId, item); removeItem(listId, itemId) }`
  - `SHOPPING_LISTS_STORE: InjectionToken<ShoppingListsStore>` (replaces `SHOPPING_LISTS_COLLECTION`)
  - `createFirestoreShoppingListsStore(): ShoppingListsStore`
  - Testing: `createInMemoryShoppingListsStore(initial?)`, `provideFakeShoppingListsStore(initial?)`, `buildShoppingList(overrides?)` (defaults: owner `'test-uid'`, the fake auth uid)
  - `ShoppingListsService.isOwner(list: ShoppingList): boolean`

- [ ] **Step 1: Failing tests for the display name and the conversions**

Add to `src/app/core/auth/auth.service.spec.ts`:

```ts
import { toDisplayName } from './auth.service';

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
```

Create `src/app/features/shopping-lists/data/shopping-list-firestore.spec.ts`:

```ts
import { buildShoppingList } from '../../../testing/in-memory-shopping-lists-store';
import { shoppingListFromFirestore, shoppingListToFirestore } from './shopping-list-firestore';

describe('shopping list Firestore mapping', () => {
  const milk = {
    id: 'item-a',
    productName: 'Milk',
    unitLabel: 'l',
    categoryName: 'Dairy',
    quantity: 2,
    purchased: false,
  };

  it('stores items as a map keyed by item id', () => {
    const stored = shoppingListToFirestore(buildShoppingList({ items: [milk] }));

    expect(stored['items']).toEqual({ 'item-a': milk });
  });

  it('round-trips a list', () => {
    const list = buildShoppingList({ items: [milk] });

    expect(shoppingListFromFirestore(shoppingListToFirestore(list), list.id)).toEqual(list);
  });

  it('takes item ids from the map keys', () => {
    const list = shoppingListFromFirestore(
      { ...shoppingListToFirestore(buildShoppingList()), items: { 'item-z': { ...milk, id: 'stale' } } },
      'list-1',
    );

    expect(list.items.map((item) => item.id)).toEqual(['item-z']);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx ng test --watch=false --include src/app/core/auth/auth.service.spec.ts --include src/app/features/shopping-lists/data/shopping-list-firestore.spec.ts`
Expected: FAIL — `toDisplayName`, `buildShoppingList`, and the mapping module don't exist.

- [ ] **Step 3: Auth display name**

In `auth.service.ts` add (exported function above the class, `computed` already imported):

```ts
const FALLBACK_DISPLAY_NAME = 'Listify';

/** The name other members of a shared list see; 1-100 chars as firestore.rules requires. */
export function toDisplayName(user: Pick<User, 'displayName' | 'email'> | null | undefined): string {
  return (user?.displayName || user?.email || FALLBACK_DISPLAY_NAME).slice(0, 100);
}
```

and in the class, after `uid`:

```ts
  readonly displayName = computed(() => toDisplayName(this.user()));
```

In `src/app/testing/fake-auth-service.ts`, import `toDisplayName`, give the initial user a name and expose `displayName`:

```ts
import { toDisplayName } from '../core/auth/auth.service';
// ...
  const initialUser = initialUid
    ? ({ uid: initialUid, displayName: 'Test User' } as User)
    : initialUid === null
      ? null
      : undefined;
// ... in the returned object, after uid:
    displayName: computed(() => toDisplayName(userSignal())),
```

- [ ] **Step 4: Model, mapping and the testing store**

`shopping-list.model.ts`, extend `ShoppingList`:

```ts
export interface ShoppingList {
  id: ShoppingListId;
  name: string;
  createdAt: string;
  status: 'active' | 'completed';
  items: ShoppingListItem[];
  ownerId: string;
  /** Everyone with access, including the owner. */
  memberIds: string[];
  /** Display name per member uid, shown in the share dialog and overview. */
  memberNames: Record<string, string>;
}
```

`src/app/features/shopping-lists/data/shopping-list-firestore.ts`:

```ts
import type { DocumentData } from 'firebase/firestore';
import { ShoppingList, ShoppingListItem } from './shopping-list.model';

/**
 * Items are stored as a map keyed by item id (not an array) so that each
 * item edit is its own field-path write; concurrent edits of different
 * items by different members then never overwrite each other.
 */
export function shoppingListToFirestore(list: ShoppingList): DocumentData {
  return {
    ...list,
    items: Object.fromEntries(list.items.map((item) => [item.id, item])),
  };
}

export function shoppingListFromFirestore(data: DocumentData, id: string): ShoppingList {
  const items = (data['items'] ?? {}) as Record<string, ShoppingListItem>;
  return {
    id,
    name: data['name'],
    createdAt: data['createdAt'],
    status: data['status'],
    ownerId: data['ownerId'],
    memberIds: data['memberIds'] ?? [],
    memberNames: data['memberNames'] ?? {},
    items: Object.entries(items).map(([itemId, item]) => ({ ...item, id: itemId })),
  };
}
```

`src/app/features/shopping-lists/data/shopping-lists.store.ts`:

```ts
import { InjectionToken, Signal } from '@angular/core';
import { collection, deleteField, query, where } from 'firebase/firestore';
import { createFirestoreCollection } from '../../../core/storage/firestore-collection';
import { shoppingListFromFirestore, shoppingListToFirestore } from './shopping-list-firestore';
import { ShoppingList, ShoppingListId, ShoppingListItem, ShoppingListItemId } from './shopping-list.model';

export interface ShoppingListsStore {
  readonly lists: Signal<readonly ShoppingList[]>;
  addList(list: ShoppingList): void;
  updateList(id: ShoppingListId, changes: Partial<Pick<ShoppingList, 'name' | 'status'>>): void;
  removeList(id: ShoppingListId): void;
  /** Adds the item, or replaces the item with the same id, without touching other items. */
  putItem(listId: ShoppingListId, item: ShoppingListItem): void;
  removeItem(listId: ShoppingListId, itemId: ShoppingListItemId): void;
}

export function createFirestoreShoppingListsStore(): ShoppingListsStore {
  const documents = createFirestoreCollection<ShoppingList>({
    query: (firestore, uid) =>
      query(collection(firestore, 'shoppingLists'), where('memberIds', 'array-contains', uid)),
    docPath: (_uid, id) => `shoppingLists/${id}`,
    fromFirestore: shoppingListFromFirestore,
    toFirestore: shoppingListToFirestore,
  });
  return {
    lists: documents.items,
    addList: (list) => documents.add(list),
    updateList: (id, changes) => documents.update(id, changes),
    removeList: (id) => documents.remove(id),
    // Whole-item writes: if someone deleted the item meanwhile, it comes back
    // complete rather than as a partial `{ purchased: true }` fragment.
    putItem: (listId, item) => documents.updateFields(listId, { [`items.${item.id}`]: item }),
    removeItem: (listId, itemId) =>
      documents.updateFields(listId, { [`items.${itemId}`]: deleteField() }),
  };
}

export const SHOPPING_LISTS_STORE = new InjectionToken<ShoppingListsStore>('SHOPPING_LISTS_STORE', {
  providedIn: 'root',
  factory: createFirestoreShoppingListsStore,
});
```

`src/app/testing/in-memory-shopping-lists-store.ts`:

```ts
import { Provider, signal } from '@angular/core';
import { ShoppingList, ShoppingListId } from '../features/shopping-lists/data/shopping-list.model';
import {
  SHOPPING_LISTS_STORE,
  ShoppingListsStore,
} from '../features/shopping-lists/data/shopping-lists.store';

export function createInMemoryShoppingListsStore(
  initial: readonly ShoppingList[] = [],
): ShoppingListsStore {
  const lists = signal<readonly ShoppingList[]>(initial);
  const updateOne = (id: ShoppingListId, change: (list: ShoppingList) => ShoppingList) =>
    lists.update((all) => all.map((list) => (list.id === id ? change(list) : list)));

  return {
    lists: lists.asReadonly(),
    addList: (list) => lists.update((all) => [...all, list]),
    updateList: (id, changes) => updateOne(id, (list) => ({ ...list, ...changes })),
    removeList: (id) => lists.update((all) => all.filter((list) => list.id !== id)),
    putItem: (listId, item) =>
      updateOne(listId, (list) => ({
        ...list,
        items: list.items.some((existing) => existing.id === item.id)
          ? list.items.map((existing) => (existing.id === item.id ? item : existing))
          : [...list.items, item],
      })),
    removeItem: (listId, itemId) =>
      updateOne(listId, (list) => ({ ...list, items: list.items.filter((item) => item.id !== itemId) })),
  };
}

export function provideFakeShoppingListsStore(initial: readonly ShoppingList[] = []): Provider {
  return { provide: SHOPPING_LISTS_STORE, useFactory: () => createInMemoryShoppingListsStore(initial) };
}

/** A list owned by the default fake-auth user ('test-uid'). */
export function buildShoppingList(overrides: Partial<ShoppingList> = {}): ShoppingList {
  return {
    id: 'list-1',
    name: 'Weekly groceries',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    items: [],
    ownerId: 'test-uid',
    memberIds: ['test-uid'],
    memberNames: { 'test-uid': 'Test User' },
    ...overrides,
  };
}
```

- [ ] **Step 5: Run the Step 1 tests**

Run: `npx ng test --watch=false --include src/app/core/auth/auth.service.spec.ts --include src/app/features/shopping-lists/data/shopping-list-firestore.spec.ts`
Expected: PASS.

- [ ] **Step 6: Failing service tests**

In `shopping-lists.service.spec.ts`:
- Replace the imports of `createInMemoryCollection` and `SHOPPING_LISTS_COLLECTION` with:

```ts
import { AuthService } from '../../../core/auth/auth.service';
import { createFakeAuthService } from '../../../testing/fake-auth-service';
import { buildShoppingList, provideFakeShoppingListsStore } from '../../../testing/in-memory-shopping-lists-store';
import { ShoppingListsService } from './shopping-lists.service';
```

- Replace the `providers` array with:

```ts
      providers: [provideFakeShoppingListsStore(), { provide: AuthService, useValue: createFakeAuthService() }],
```

- Add tests:

```ts
  it('addList makes the signed-in user the owner and only member', () => {
    const list = TestBed.inject(ShoppingListsService).addList('Weekend shopping');

    expect(list.ownerId).toBe('test-uid');
    expect(list.memberIds).toEqual(['test-uid']);
    expect(list.memberNames).toEqual({ 'test-uid': 'Test User' });
  });

  it('importList makes the signed-in user the owner', () => {
    const list = TestBed.inject(ShoppingListsService).importList({ name: 'Imported', items: [] });

    expect(list.ownerId).toBe('test-uid');
    expect(list.memberIds).toEqual(['test-uid']);
  });

  it('isOwner distinguishes own lists from lists shared with the user', () => {
    const service = TestBed.inject(ShoppingListsService);

    expect(service.isOwner(buildShoppingList())).toBe(true);
    expect(service.isOwner(buildShoppingList({ ownerId: 'someone-else' }))).toBe(false);
  });

  it('removeItem leaves the other items untouched', () => {
    const service = TestBed.inject(ShoppingListsService);
    const list = service.addList('Weekend shopping');
    service.addItemFromProduct(list.id, product, 'l', 1);
    service.addItemFromProduct(list.id, { ...product, id: 'p2', name: 'Bread' }, 'pcs', 1);
    const [first, second] = service.lists()[0].items;

    service.removeItem(list.id, first.id);

    expect(service.lists()[0].items).toEqual([second]);
  });
```

Run: `npx ng test --watch=false --include src/app/features/shopping-lists/data/shopping-lists.service.spec.ts`
Expected: FAIL (compile: service still injects `SHOPPING_LISTS_COLLECTION`, `isOwner` missing).

- [ ] **Step 7: Rewrite `ShoppingListsService`**

Remove the `SHOPPING_LISTS_COLLECTION` token and the `collection`/`createFirestoreCollection` imports. The class becomes:

```ts
import { inject, Service } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { Product } from '../../products/data/product.model';
import { type ShoppingListExport } from './shopping-list-export';
import { ShoppingList, ShoppingListId, ShoppingListItem, ShoppingListItemId } from './shopping-list.model';
import { SHOPPING_LISTS_STORE } from './shopping-lists.store';

@Service()
export class ShoppingListsService {
  private readonly store = inject(SHOPPING_LISTS_STORE);
  private readonly authService = inject(AuthService);

  readonly lists = this.store.lists;

  isOwner(list: ShoppingList): boolean {
    return list.ownerId === this.authService.uid();
  }

  addList(name: string): ShoppingList {
    const list: ShoppingList = { ...this.newList(name), items: [] };
    this.store.addList(list);
    return list;
  }

  importList(data: ShoppingListExport['list']): ShoppingList {
    const list: ShoppingList = {
      ...this.newList(data.name),
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
    this.store.addList(list);
    return list;
  }

  setStatus(id: ShoppingListId, status: ShoppingList['status']): void {
    this.store.updateList(id, { status });
  }

  rename(id: ShoppingListId, name: string): void {
    this.store.updateList(id, { name });
  }

  removeList(id: ShoppingListId): void {
    this.store.removeList(id);
  }

  addItemFromProduct(
    listId: ShoppingListId,
    product: Product,
    unitSymbol: string,
    quantity: number,
    note?: string,
  ): boolean {
    const list = this.activeList(listId);
    if (!list) {
      return false;
    }
    const existing = list.items.find((item) =>
      this.isSameUnpurchasedItem(item, product, unitSymbol, note),
    );
    if (existing) {
      this.store.putItem(listId, { ...existing, quantity: existing.quantity + quantity });
      return true;
    }
    this.store.putItem(listId, {
      id: crypto.randomUUID(),
      productName: product.name,
      unitLabel: unitSymbol,
      categoryName: product.categoryName,
      quantity,
      purchased: false,
      note,
    });
    return false;
  }

  setItemPurchased(listId: ShoppingListId, itemId: ShoppingListItemId, purchased: boolean): void {
    const item = this.activeItem(listId, itemId);
    if (item) {
      this.store.putItem(listId, { ...item, purchased });
    }
  }

  updateItem(
    listId: ShoppingListId,
    itemId: ShoppingListItemId,
    quantity: number,
    note?: string,
  ): void {
    const item = this.activeItem(listId, itemId);
    if (item) {
      this.store.putItem(listId, { ...item, quantity, note });
    }
  }

  removeItem(listId: ShoppingListId, itemId: ShoppingListItemId): void {
    if (this.activeList(listId)) {
      this.store.removeItem(listId, itemId);
    }
  }

  private newList(name: string): Omit<ShoppingList, 'items'> {
    const uid = this.authService.uid() ?? '';
    return {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      status: 'active',
      ownerId: uid,
      memberIds: [uid],
      memberNames: { [uid]: this.authService.displayName() },
    };
  }

  private activeList(listId: ShoppingListId): ShoppingList | undefined {
    const list = this.lists().find((l) => l.id === listId);
    return list?.status === 'active' ? list : undefined;
  }

  private activeItem(listId: ShoppingListId, itemId: ShoppingListItemId): ShoppingListItem | undefined {
    return this.activeList(listId)?.items.find((item) => item.id === itemId);
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
}
```

(Signed out: `uid` is `''`, but the store's `add` reports the missing user before writing, exactly as before.)

- [ ] **Step 8: Update the other specs' fixtures and providers**

- `shopping-list-export.spec.ts`: in both `const list: ShoppingList = { ... }` fixtures, add `ownerId: 'u1', memberIds: ['u1'], memberNames: { u1: 'Owner' },` after `status`.
- `shopping-list-detail.spec.ts` (both `configureTestingModule` calls, lines ~46 and ~633): replace `provideFakeCollection(SHOPPING_LISTS_COLLECTION),` with

```ts
        provideFakeShoppingListsStore(),
        { provide: AuthService, useValue: createFakeAuthService() },
```

  and fix imports (`SHOPPING_LISTS_COLLECTION` no longer exists; import `AuthService`, `createFakeAuthService`, `provideFakeShoppingListsStore`).
- `shopping-lists-overview.spec.ts`: same replacement in `beforeEach` (line ~41). In "formats the created-at date in the selected language" replace the `{ provide: SHOPPING_LISTS_COLLECTION, useFactory: ... }` provider with

```ts
        provideFakeShoppingListsStore([
          buildShoppingList({ id: '1', createdAt: '2026-03-05T12:00:00.000Z' }),
        ]),
```

  Drop the now-unused `createInMemoryCollection` / `SHOPPING_LISTS_COLLECTION` imports.
- Find stragglers: `grep -rn "SHOPPING_LISTS_COLLECTION" src` must print nothing.

- [ ] **Step 9: Store test against the emulator**

`src/app/features/shopping-lists/data/shopping-lists.store.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { FIRESTORE } from '../../../core/firebase/firebase.providers';
import { createFakeAuthService } from '../../../testing/fake-auth-service';
import {
  createEmulatorUser,
  disposeEmulatorUser,
  isFirestoreEmulatorReachable,
  type EmulatorUser,
} from '../../../testing/firebase-emulator';
import { buildShoppingList } from '../../../testing/in-memory-shopping-lists-store';
import { createFirestoreShoppingListsStore } from './shopping-lists.store';

const emulatorAvailable = await isFirestoreEmulatorReachable();

describe.skipIf(!emulatorAvailable)('createFirestoreShoppingListsStore (Firestore emulator)', () => {
  let user: EmulatorUser;

  beforeEach(async () => {
    user = await createEmulatorUser('Owner');
    const auth = createFakeAuthService(user.uid);
    auth.setUser(user.user);
    TestBed.configureTestingModule({
      providers: [
        { provide: FIRESTORE, useValue: user.firestore },
        { provide: AuthService, useValue: auth },
      ],
    });
  });

  afterEach(async () => {
    await disposeEmulatorUser(user);
  });

  it('round-trips a list and per-item writes through firestore.rules', async () => {
    const store = TestBed.runInInjectionContext(() => createFirestoreShoppingListsStore());
    const milk = { id: 'item-a', productName: 'Milk', unitLabel: 'l', categoryName: 'Dairy', quantity: 1, purchased: false };
    const list = buildShoppingList({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ownerId: user.uid,
      memberIds: [user.uid],
      memberNames: { [user.uid]: 'Owner' },
      items: [milk],
    });

    store.addList(list);
    await vi.waitFor(() => expect(store.lists()).toEqual([list]));

    store.putItem(list.id, { ...milk, purchased: true });
    await vi.waitFor(() => expect(store.lists()[0].items).toEqual([{ ...milk, purchased: true }]));

    store.removeItem(list.id, milk.id);
    await vi.waitFor(() => expect(store.lists()[0].items).toEqual([]));

    store.updateList(list.id, { status: 'completed' });
    await vi.waitFor(() => expect(store.lists()[0].status).toBe('completed'));
  });
});
```

- [ ] **Step 10: Run everything**

Run: `npx ng test --watch=false` (emulators running so the store spec executes)
Expected: PASS, including the existing service/detail/overview/export specs.
Run: `npx ng lint`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add src/app
git commit -m "feat(shopping-lists): store lists in shared collection with per-item writes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `ShoppingListSharingService`

**Files:**
- Create: `src/app/features/shopping-lists/data/shopping-list-sharing.service.ts`
- Create: `src/app/features/shopping-lists/data/shopping-list-sharing.service.spec.ts` (emulator)
- Create: `src/app/testing/fake-shopping-list-sharing-service.ts`

**Interfaces:**
- Consumes: Task 2 write shapes, Task 3 `FirestoreErrorReporter`, Task 4 `AuthService.displayName`.
- Produces:
  - `type JoinResult = 'joined' | 'already-member' | 'invalid-link' | 'failed'`
  - `ShoppingListSharingService.getInviteLink(listId: string): Promise<string | null>`
  - `.regenerateInviteLink(listId: string): Promise<string | null>`
  - `.join(listId: string, token: string): Promise<JoinResult>`
  - `.leave(listId: string): Promise<boolean>`
  - `.removeMember(listId: string, memberId: string, revokeLink: boolean): Promise<boolean>`
  - Testing: `createFakeSharingService(): ShoppingListSharingService` (links `https://listify.test/lists/join/{listId}/token-1` and `token-2` for regenerate; `join` → `'joined'`; `leave`/`removeMember` → `true`)

- [ ] **Step 1: Write the failing emulator spec**

```ts
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { FIRESTORE } from '../../../core/firebase/firebase.providers';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { createFakeAuthService } from '../../../testing/fake-auth-service';
import {
  createEmulatorUser,
  disposeEmulatorUser,
  errorCode,
  isFirestoreEmulatorReachable,
  shoppingListDoc,
  type EmulatorUser,
} from '../../../testing/firebase-emulator';
import { ShoppingListSharingService } from './shopping-list-sharing.service';

const emulatorAvailable = await isFirestoreEmulatorReachable();

describe.skipIf(!emulatorAvailable)('ShoppingListSharingService (Firestore emulator)', () => {
  let owner: EmulatorUser;
  let member: EmulatorUser;

  beforeAll(async () => {
    owner = await createEmulatorUser('Owner');
    member = await createEmulatorUser('Member');
  });

  afterAll(async () => {
    await disposeEmulatorUser(owner);
    await disposeEmulatorUser(member);
  });

  beforeEach(() => {
    vi.spyOn(TestBed.inject(ConfirmDialogService), 'alert').mockResolvedValue();
  });

  /** A service instance acting as `user` (own Firestore client + auth). */
  function sharingAs(user: EmulatorUser): ShoppingListSharingService {
    const auth = createFakeAuthService(user.uid);
    auth.setUser(user.user);
    const injector = createEnvironmentInjector(
      [
        { provide: FIRESTORE, useValue: user.firestore },
        { provide: AuthService, useValue: auth },
        ShoppingListSharingService,
      ],
      TestBed.inject(EnvironmentInjector),
    );
    return injector.get(ShoppingListSharingService);
  }

  async function createList(): Promise<string> {
    const data = shoppingListDoc(owner);
    await setDoc(doc(owner.firestore, 'shoppingLists', data.id), data);
    return data.id;
  }

  function tokenOf(link: string | null): string {
    return link!.split('/').pop()!;
  }

  it('creates the invite link once and returns the same link afterwards', async () => {
    const listId = await createList();
    const sharing = sharingAs(owner);

    const first = await sharing.getInviteLink(listId);
    const second = await sharing.getInviteLink(listId);

    expect(first).toContain(`/lists/join/${listId}/`);
    expect(second).toBe(first);
  });

  it('joins with a valid link, then reports already-member', async () => {
    const listId = await createList();
    const link = await sharingAs(owner).getInviteLink(listId);
    const memberSharing = sharingAs(member);

    expect(await memberSharing.join(listId, tokenOf(link))).toBe('joined');
    expect(await memberSharing.join(listId, tokenOf(link))).toBe('already-member');
    const list = await getDoc(doc(member.firestore, 'shoppingLists', listId));
    expect(list.data()?.['memberNames'][member.uid]).toBe('Member');
  });

  it('reports already-member when the owner opens their own link', async () => {
    const listId = await createList();
    const sharing = sharingAs(owner);
    const link = await sharing.getInviteLink(listId);

    expect(await sharing.join(listId, tokenOf(link))).toBe('already-member');
  });

  it('reports invalid-link for a wrong token, a regenerated token, and a missing list', async () => {
    const listId = await createList();
    const ownerSharing = sharingAs(owner);
    const oldLink = await ownerSharing.getInviteLink(listId);
    const newLink = await ownerSharing.regenerateInviteLink(listId);
    const memberSharing = sharingAs(member);

    expect(newLink).not.toBe(oldLink);
    expect(await memberSharing.join(listId, 'not-a-real-token-not-a-real-token')).toBe('invalid-link');
    expect(await memberSharing.join(listId, tokenOf(oldLink))).toBe('invalid-link');
    expect(await memberSharing.join(crypto.randomUUID(), tokenOf(newLink))).toBe('invalid-link');
  });

  it('lets a member leave', async () => {
    const listId = await createList();
    const link = await sharingAs(owner).getInviteLink(listId);
    const memberSharing = sharingAs(member);
    await memberSharing.join(listId, tokenOf(link));

    expect(await memberSharing.leave(listId)).toBe(true);
    expect(await errorCode(getDoc(doc(member.firestore, 'shoppingLists', listId)))).toBe('permission-denied');
  });

  it('removes a member; without revoking, the old link still lets them back in', async () => {
    const listId = await createList();
    const ownerSharing = sharingAs(owner);
    const link = await ownerSharing.getInviteLink(listId);
    const memberSharing = sharingAs(member);
    await memberSharing.join(listId, tokenOf(link));

    expect(await ownerSharing.removeMember(listId, member.uid, false)).toBe(true);
    expect(await memberSharing.join(listId, tokenOf(link))).toBe('joined');
  });

  it('removes a member and revokes the link so the old link stops working', async () => {
    const listId = await createList();
    const ownerSharing = sharingAs(owner);
    const link = await ownerSharing.getInviteLink(listId);
    const memberSharing = sharingAs(member);
    await memberSharing.join(listId, tokenOf(link));

    expect(await ownerSharing.removeMember(listId, member.uid, true)).toBe(true);
    expect(await memberSharing.join(listId, tokenOf(link))).toBe('invalid-link');
    expect(await ownerSharing.getInviteLink(listId)).not.toBe(link);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (emulators running): `npx ng test --watch=false --include src/app/features/shopping-lists/data/shopping-list-sharing.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

```ts
import { DOCUMENT, inject, Service } from '@angular/core';
import {
  arrayRemove,
  arrayUnion,
  deleteField,
  doc,
  FirestoreError,
  getDoc,
  setDoc,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import { AuthService } from '../../../core/auth/auth.service';
import { FIRESTORE } from '../../../core/firebase/firebase.providers';
import { FirestoreErrorReporter } from '../../../core/storage/firestore-error-reporter';

export type JoinResult = 'joined' | 'already-member' | 'invalid-link' | 'failed';

/**
 * Manages who can access a shopping list: invite links, joining, leaving
 * and removing members. Every write shape here is the one firestore.rules
 * verifies (see firestore-rules.spec.ts). Methods never throw: unexpected
 * failures go to the generic error alert and come back as null / false /
 * 'failed'.
 */
@Service()
export class ShoppingListSharingService {
  private readonly firestore = inject(FIRESTORE);
  private readonly authService = inject(AuthService);
  private readonly errorReporter = inject(FirestoreErrorReporter);
  private readonly document = inject(DOCUMENT);

  async getInviteLink(listId: string): Promise<string | null> {
    try {
      const snapshot = await getDoc(this.inviteRef(listId));
      const token = snapshot.exists()
        ? (snapshot.data()['token'] as string)
        : await this.writeNewToken(listId);
      return this.buildLink(listId, token);
    } catch (error) {
      this.errorReporter.report(error);
      return null;
    }
  }

  async regenerateInviteLink(listId: string): Promise<string | null> {
    try {
      return this.buildLink(listId, await this.writeNewToken(listId));
    } catch (error) {
      this.errorReporter.report(error);
      return null;
    }
  }

  async join(listId: string, token: string): Promise<JoinResult> {
    const uid = this.authService.uid();
    if (!uid) {
      return 'failed';
    }
    if (await this.isMember(listId, uid)) {
      return 'already-member';
    }
    const batch = writeBatch(this.firestore);
    batch.set(this.joinRef(listId, uid), { token });
    batch.update(this.listRef(listId), {
      memberIds: arrayUnion(uid),
      [`memberNames.${uid}`]: this.authService.displayName(),
    });
    try {
      await batch.commit();
      return 'joined';
    } catch (error) {
      // Rules deny a wrong/old token, and a missing list fails the same way.
      if (error instanceof FirestoreError && (error.code === 'permission-denied' || error.code === 'not-found')) {
        return 'invalid-link';
      }
      this.errorReporter.report(error);
      return 'failed';
    }
  }

  async leave(listId: string): Promise<boolean> {
    const uid = this.authService.uid();
    return uid ? this.removeFromList(listId, uid, false) : false;
  }

  removeMember(listId: string, memberId: string, revokeLink: boolean): Promise<boolean> {
    return this.removeFromList(listId, memberId, revokeLink);
  }

  private async removeFromList(listId: string, uid: string, revokeLink: boolean): Promise<boolean> {
    const batch = writeBatch(this.firestore);
    batch.update(this.listRef(listId), {
      memberIds: arrayRemove(uid),
      [`memberNames.${uid}`]: deleteField(),
    });
    batch.delete(this.joinRef(listId, uid));
    if (revokeLink) {
      batch.set(this.inviteRef(listId), { token: crypto.randomUUID() });
    }
    try {
      await batch.commit();
      return true;
    } catch (error) {
      this.errorReporter.report(error);
      return false;
    }
  }

  /** Non-members are denied the read itself, which also means "not a member". */
  private async isMember(listId: string, uid: string): Promise<boolean> {
    try {
      const snapshot = await getDoc(this.listRef(listId));
      return snapshot.exists() && (snapshot.data()['memberIds'] as string[]).includes(uid);
    } catch {
      return false;
    }
  }

  private async writeNewToken(listId: string): Promise<string> {
    const token = crypto.randomUUID();
    await setDoc(this.inviteRef(listId), { token });
    return token;
  }

  private buildLink(listId: string, token: string): string {
    return new URL(`lists/join/${listId}/${token}`, this.document.baseURI).href;
  }

  private listRef(listId: string): DocumentReference {
    return doc(this.firestore, 'shoppingLists', listId);
  }

  private inviteRef(listId: string): DocumentReference {
    return doc(this.firestore, 'shoppingLists', listId, 'invite', 'current');
  }

  private joinRef(listId: string, uid: string): DocumentReference {
    return doc(this.firestore, 'shoppingLists', listId, 'joins', uid);
  }
}
```

If `DOCUMENT` is not exported from `@angular/core` in this version, import it from `@angular/common` instead.

- [ ] **Step 4: Testing fake**

`src/app/testing/fake-shopping-list-sharing-service.ts`:

```ts
import {
  JoinResult,
  ShoppingListSharingService,
} from '../features/shopping-lists/data/shopping-list-sharing.service';

/** Resolves every call successfully; specs override single methods with vi.spyOn. */
export function createFakeSharingService(): ShoppingListSharingService {
  return {
    getInviteLink: (listId: string) => Promise.resolve(`https://listify.test/lists/join/${listId}/token-1`),
    regenerateInviteLink: (listId: string) =>
      Promise.resolve(`https://listify.test/lists/join/${listId}/token-2`),
    join: () => Promise.resolve<JoinResult>('joined'),
    leave: () => Promise.resolve(true),
    removeMember: () => Promise.resolve(true),
  } as unknown as ShoppingListSharingService;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx ng test --watch=false --include src/app/features/shopping-lists/data/shopping-list-sharing.service.spec.ts`
Expected: all 7 PASS, none skipped.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/shopping-lists/data/shopping-list-sharing.service.ts src/app/features/shopping-lists/data/shopping-list-sharing.service.spec.ts src/app/testing/fake-shopping-list-sharing-service.ts
git commit -m "feat(shopping-lists): add sharing service for invite links and membership

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `InviteLinkPanel` (owner's link controls)

**Files:**
- Create: `src/app/features/shopping-lists/share-list-dialog/invite-link-panel.ts` + `.spec.ts`
- Modify: `src/app/core/i18n/translations/en.ts`, `pl.ts`

**Interfaces:**
- Consumes: `ShoppingListSharingService.getInviteLink` / `regenerateInviteLink`, `createFakeSharingService`, `ConfirmDialogService.confirm`.
- Produces: `<app-invite-link-panel [listId]="..." [version]="..." />`; bumping `version` reloads the link.

- [ ] **Step 1: Add translations**

`en.ts` (before the closing `} as const`):

```ts
  'share.title': 'Share “{name}”',
  'share.close': 'Close',
  'share.linkHeading': 'Invite link',
  'share.linkHint': 'Anyone signed in who opens this link can join the list.',
  'share.linkLabel': 'Link',
  'share.copy': 'Copy',
  'share.copied': 'Link copied.',
  'share.copyFailed': "Couldn't copy the link — select it and copy it manually.",
  'share.send': 'Send',
  'share.sendTitle': 'Shopping list on Listify',
  'share.regenerate': 'Generate new link',
  'share.regenerateTitle': 'Generate a new link?',
  'share.regenerateMessage': 'The current link will stop working. People who already joined keep access.',
  'share.regenerateConfirm': 'Generate',
  'share.regenerated': 'New link generated.',
```

`pl.ts`:

```ts
  'share.title': 'Udostępnij „{name}”',
  'share.close': 'Zamknij',
  'share.linkHeading': 'Link z zaproszeniem',
  'share.linkHint': 'Każda zalogowana osoba, która otworzy ten link, może dołączyć do listy.',
  'share.linkLabel': 'Link',
  'share.copy': 'Kopiuj',
  'share.copied': 'Skopiowano link.',
  'share.copyFailed': 'Nie udało się skopiować linku — zaznacz go i skopiuj ręcznie.',
  'share.send': 'Wyślij',
  'share.sendTitle': 'Lista zakupów w Listify',
  'share.regenerate': 'Wygeneruj nowy link',
  'share.regenerateTitle': 'Wygenerować nowy link?',
  'share.regenerateMessage': 'Obecny link przestanie działać. Osoby, które już dołączyły, zachowają dostęp.',
  'share.regenerateConfirm': 'Wygeneruj',
  'share.regenerated': 'Wygenerowano nowy link.',
```

- [ ] **Step 2: Write the failing spec**

```ts
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { createFakeSharingService } from '../../../testing/fake-shopping-list-sharing-service';
import { ShoppingListSharingService } from '../data/shopping-list-sharing.service';
import { InviteLinkPanel } from './invite-link-panel';

describe('InviteLinkPanel', () => {
  let sharing: ShoppingListSharingService;

  beforeEach(() => {
    sharing = createFakeSharingService();
    TestBed.configureTestingModule({
      imports: [InviteLinkPanel],
      providers: [{ provide: ShoppingListSharingService, useValue: sharing }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as { clipboard?: unknown }).clipboard;
    delete (navigator as { share?: unknown }).share;
  });

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(InviteLinkPanel);
    fixture.componentRef.setInput('listId', 'list-1');
    fixture.autoDetectChanges();
    await TestBed.inject(ApplicationRef).whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function button(root: HTMLElement, text: string): HTMLButtonElement {
    return Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;
  }

  it('shows the invite link in a labelled read-only field', async () => {
    const root = await render();

    const input = root.querySelector<HTMLInputElement>('#invite-link')!;
    expect(input.value).toBe('https://listify.test/lists/join/list-1/token-1');
    expect(input.readOnly).toBe(true);
    expect(root.querySelector('label[for="invite-link"]')).not.toBeNull();
  });

  it('copies the link and announces it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const root = await render();

    button(root, 'Copy').click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(writeText).toHaveBeenCalledWith('https://listify.test/lists/join/list-1/token-1');
    expect(root.querySelector('[aria-live="polite"]')!.textContent).toContain('Link copied.');
  });

  it('tells the user to copy manually when the clipboard is unavailable', async () => {
    const root = await render();

    button(root, 'Copy').click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(root.querySelector('[aria-live="polite"]')!.textContent).toContain("Couldn't copy the link");
  });

  it('regenerates the link after confirmation', async () => {
    vi.spyOn(TestBed.inject(ConfirmDialogService), 'confirm').mockResolvedValue(true);
    const regenerate = vi.spyOn(sharing, 'regenerateInviteLink');
    const root = await render();

    button(root, 'Generate new link').click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(regenerate).toHaveBeenCalledWith('list-1');
    expect(root.querySelector<HTMLInputElement>('#invite-link')!.value).toBe(
      'https://listify.test/lists/join/list-1/token-2',
    );
  });

  it('keeps the link when regeneration is cancelled', async () => {
    vi.spyOn(TestBed.inject(ConfirmDialogService), 'confirm').mockResolvedValue(false);
    const regenerate = vi.spyOn(sharing, 'regenerateInviteLink');
    const root = await render();

    button(root, 'Generate new link').click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(regenerate).not.toHaveBeenCalled();
  });

  it('offers Send only where the Web Share API exists', async () => {
    expect(button(await render(), 'Send')).toBeUndefined();

    Object.defineProperty(navigator, 'share', { value: vi.fn(), configurable: true });
    expect(button(await render(), 'Send')).toBeDefined();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx ng test --watch=false --include src/app/features/shopping-lists/share-list-dialog/invite-link-panel.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the component**

```ts
import { Component, inject, input, resource, signal } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n.service';
import { TranslationKey } from '../../../core/i18n/translations/en';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { ShoppingListSharingService } from '../data/shopping-list-sharing.service';

@Component({
  selector: 'app-invite-link-panel',
  template: `
    <section class="share-section" aria-labelledby="invite-link-heading">
      <h3 id="invite-link-heading">{{ t('share.linkHeading') }}</h3>
      <p class="share-section__hint">{{ t('share.linkHint') }}</p>
      <label class="field-label" for="invite-link">{{ t('share.linkLabel') }}</label>
      <input id="invite-link" type="text" class="field-input" readonly [value]="link.value() ?? ''" />
      <div class="form-actions">
        <button type="button" class="btn-outline-pill" [disabled]="!link.value()" (click)="copy()">
          {{ t('share.copy') }}
        </button>
        @if (canNativeShare) {
          <button type="button" class="btn-outline-pill" [disabled]="!link.value()" (click)="send()">
            {{ t('share.send') }}
          </button>
        }
        <button type="button" class="btn-outline-pill" [disabled]="!link.value()" (click)="regenerate()">
          {{ t('share.regenerate') }}
        </button>
      </div>
      <p class="field-info" aria-live="polite">
        @if (statusKey(); as key) {
          {{ t(key) }}
        }
      </p>
    </section>
  `,
  styles: `
    .share-section h3 {
      margin: 0 0 0.25rem;
      font-size: 1rem;
    }

    .share-section__hint {
      margin: 0 0 0.75rem;
      font-size: 0.875rem;
      color: rgba(20, 32, 29, 0.7);
    }
  `,
})
export class InviteLinkPanel {
  readonly listId = input.required<string>();
  /** Bump to reload the link after it was changed elsewhere (e.g. revoked on member removal). */
  readonly version = input(0);

  private readonly sharingService = inject(ShoppingListSharingService);
  private readonly confirmDialogService = inject(ConfirmDialogService);
  protected readonly t = inject(I18n).t;

  protected readonly canNativeShare = typeof navigator.share === 'function';
  protected readonly statusKey = signal<TranslationKey | null>(null);
  protected readonly link = resource({
    params: () => ({ listId: this.listId(), version: this.version() }),
    loader: ({ params }) => this.sharingService.getInviteLink(params.listId),
  });

  protected async copy(): Promise<void> {
    const link = this.link.value();
    if (!link) {
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      this.statusKey.set('share.copied');
    } catch {
      // No clipboard API or permission denied — the field stays selectable.
      this.statusKey.set('share.copyFailed');
    }
  }

  protected async send(): Promise<void> {
    const link = this.link.value();
    if (!link) {
      return;
    }
    try {
      await navigator.share({ title: this.t('share.sendTitle'), url: link });
    } catch {
      // Cancelled share sheet — the link is still visible to copy.
    }
  }

  protected async regenerate(): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: this.t('share.regenerateTitle'),
      message: this.t('share.regenerateMessage'),
      confirmLabel: this.t('share.regenerateConfirm'),
    });
    if (!confirmed) {
      return;
    }
    const link = await this.sharingService.regenerateInviteLink(this.listId());
    if (link) {
      this.link.set(link);
      this.statusKey.set('share.regenerated');
    }
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx ng test --watch=false --include src/app/features/shopping-lists/share-list-dialog/invite-link-panel.spec.ts`
Expected: PASS. If `resource` exposes the param option as `request` in this Angular version, rename `params` → `request` in both places.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/shopping-lists/share-list-dialog/invite-link-panel.ts src/app/features/shopping-lists/share-list-dialog/invite-link-panel.spec.ts src/app/core/i18n/translations
git commit -m "feat(shopping-lists): add invite link panel with copy, send and regenerate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `MembersPanel`, `ShareListDialog` and the detail page wiring

**Files:**
- Create: `src/app/features/shopping-lists/share-list-dialog/members-panel.ts` + `.spec.ts`
- Create: `src/app/features/shopping-lists/share-list-dialog/share-list-dialog.ts` + `.spec.ts`
- Modify: `src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.ts` + `.spec.ts`
- Modify: `en.ts`, `pl.ts`

**Interfaces:**
- Consumes: Task 6 `InviteLinkPanel`; `ShoppingListSharingService.leave` / `removeMember`; `ShoppingListsService.lists` / `isOwner`; `buildShoppingList`, `provideFakeShoppingListsStore`, `createFakeSharingService`, `createFakeAuthService`.
- Produces:
  - `<app-members-panel [list]="ShoppingList" [canManage]="boolean" (left)="..." (linkRevoked)="..." />`
  - `ShareListDialog` with `DIALOG_DATA: ShareListDialogData = { listId: string }`

- [ ] **Step 1: Translations**

`en.ts`:

```ts
  'share.membersHeading': 'People with access',
  'share.ownerBadge': 'Owner',
  'share.removeMemberFor': 'Remove {name}',
  'share.removeConfirmFor': 'Remove {name} from the list?',
  'share.alsoRevokeLink': 'Also invalidate the current link',
  'share.removeConfirm': 'Remove',
  'share.leave': 'Leave list',
  'share.leaveTitle': 'Leave this list?',
  'share.leaveMessage': "You'll lose access until someone shares it with you again.",
  'share.leaveConfirm': 'Leave',
  'listDetail.export': 'Export',
  'listDetail.exportFor': 'Export {name}',
```

`pl.ts`:

```ts
  'share.membersHeading': 'Osoby z dostępem',
  'share.ownerBadge': 'Właściciel',
  'share.removeMemberFor': 'Usuń {name}',
  'share.removeConfirmFor': 'Usunąć {name} z listy?',
  'share.alsoRevokeLink': 'Unieważnij też obecny link',
  'share.removeConfirm': 'Usuń',
  'share.leave': 'Opuść listę',
  'share.leaveTitle': 'Opuścić tę listę?',
  'share.leaveMessage': 'Stracisz dostęp, dopóki ktoś ponownie Ci jej nie udostępni.',
  'share.leaveConfirm': 'Opuść',
  'listDetail.export': 'Eksportuj',
  'listDetail.exportFor': 'Eksportuj listę {name}',
```

- [ ] **Step 2: Failing `MembersPanel` spec**

```ts
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { createFakeSharingService } from '../../../testing/fake-shopping-list-sharing-service';
import { buildShoppingList } from '../../../testing/in-memory-shopping-lists-store';
import { ShoppingListSharingService } from '../data/shopping-list-sharing.service';
import { MembersPanel } from './members-panel';

const SHARED = buildShoppingList({
  memberIds: ['test-uid', 'ania-uid'],
  memberNames: { 'test-uid': 'Test User', 'ania-uid': 'Ania' },
});

describe('MembersPanel', () => {
  let sharing: ShoppingListSharingService;

  beforeEach(() => {
    sharing = createFakeSharingService();
    TestBed.configureTestingModule({
      imports: [MembersPanel],
      providers: [{ provide: ShoppingListSharingService, useValue: sharing }],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  function render(canManage: boolean) {
    const fixture = TestBed.createComponent(MembersPanel);
    fixture.componentRef.setInput('list', SHARED);
    fixture.componentRef.setInput('canManage', canManage);
    fixture.autoDetectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  function button(root: HTMLElement, text: string): HTMLButtonElement | undefined {
    return Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  }

  it('lists members with the owner first and marked', () => {
    const { root } = render(true);

    const rows = Array.from(root.querySelectorAll('li')).map((li) => li.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows[0]).toContain('Test User');
    expect(rows[0]).toContain('Owner');
    expect(rows[1]).toContain('Ania');
  });

  it('removes a member and revokes the link by default', async () => {
    const removeMember = vi.spyOn(sharing, 'removeMember');
    const { fixture, root } = render(true);
    const revoked = vi.fn();
    fixture.componentInstance.linkRevoked.subscribe(revoked);

    root.querySelector<HTMLButtonElement>('button[aria-label="Remove Ania"]')!.click();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    button(root, 'Remove')!.click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(removeMember).toHaveBeenCalledWith('list-1', 'ania-uid', true);
    expect(revoked).toHaveBeenCalled();
  });

  it('keeps the link when the checkbox is cleared', async () => {
    const removeMember = vi.spyOn(sharing, 'removeMember');
    const { fixture, root } = render(true);
    const revoked = vi.fn();
    fixture.componentInstance.linkRevoked.subscribe(revoked);

    root.querySelector<HTMLButtonElement>('button[aria-label="Remove Ania"]')!.click();
    await TestBed.inject(ApplicationRef).whenStable();
    root.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    button(root, 'Remove')!.click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(removeMember).toHaveBeenCalledWith('list-1', 'ania-uid', false);
    expect(revoked).not.toHaveBeenCalled();
  });

  it('shows members no remove buttons, only Leave', () => {
    const { root } = render(false);

    expect(root.querySelector('button[aria-label^="Remove"]')).toBeNull();
    expect(button(root, 'Leave list')).toBeDefined();
  });

  it('leaves after confirmation and emits left', async () => {
    vi.spyOn(TestBed.inject(ConfirmDialogService), 'confirm').mockResolvedValue(true);
    const leave = vi.spyOn(sharing, 'leave');
    const { fixture, root } = render(false);
    const left = vi.fn();
    fixture.componentInstance.left.subscribe(left);

    button(root, 'Leave list')!.click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(leave).toHaveBeenCalledWith('list-1');
    expect(left).toHaveBeenCalled();
  });
});
```

Run: `npx ng test --watch=false --include src/app/features/shopping-lists/share-list-dialog/members-panel.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `MembersPanel`**

```ts
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
} from '@angular/core';
import { I18n } from '../../../core/i18n/i18n.service';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';
import { ShoppingListSharingService } from '../data/shopping-list-sharing.service';
import { ShoppingList } from '../data/shopping-list.model';

interface MemberView {
  readonly uid: string;
  readonly name: string;
  readonly isOwner: boolean;
}

@Component({
  selector: 'app-members-panel',
  template: `
    <section class="share-section" aria-labelledby="members-heading">
      <h3 id="members-heading" tabindex="-1">{{ t('share.membersHeading') }}</h3>
      <ul class="members">
        @for (member of members(); track member.uid) {
          <li class="members__item" [attr.data-member-uid]="member.uid">
            <span class="members__name">{{ member.name }}</span>
            @if (member.isOwner) {
              <span class="pill">{{ t('share.ownerBadge') }}</span>
            }
            @if (canManage() && !member.isOwner) {
              @if (pendingRemovalUid() === member.uid) {
                <div
                  class="members__confirm"
                  role="group"
                  [attr.aria-label]="t('share.removeConfirmFor', { name: member.name })"
                >
                  <label class="members__checkbox">
                    <input type="checkbox" [checked]="revokeLink()" (change)="onRevokeLinkChange($event)" />
                    {{ t('share.alsoRevokeLink') }}
                  </label>
                  <div class="form-actions">
                    <button type="button" class="btn-outline-pill" (click)="cancelRemoval(member.uid)">
                      {{ t('common.cancel') }}
                    </button>
                    <button type="button" class="btn-accent-pill-lg" (click)="confirmRemoval(member.uid)">
                      {{ t('share.removeConfirm') }}
                    </button>
                  </div>
                </div>
              } @else {
                <button
                  type="button"
                  class="icon-btn"
                  (click)="startRemoval(member.uid)"
                  [attr.aria-label]="t('share.removeMemberFor', { name: member.name })"
                >
                  <svg
                    class="icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
              }
            }
          </li>
        }
      </ul>
      @if (!canManage()) {
        <button type="button" class="btn-outline-pill" (click)="leave()">{{ t('share.leave') }}</button>
      }
    </section>
  `,
  styles: `
    .share-section h3 {
      margin: 0 0 0.5rem;
      font-size: 1rem;
    }

    .members {
      list-style: none;
      margin: 0 0 1rem;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .members__item {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }

    .members__name {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .members__confirm {
      flex-basis: 100%;
    }

    .members__checkbox {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
  `,
})
export class MembersPanel {
  readonly list = input.required<ShoppingList>();
  /** True for the owner: may remove members. Members get "Leave" instead. */
  readonly canManage = input(false);
  readonly left = output<void>();
  readonly linkRevoked = output<void>();

  private readonly sharingService = inject(ShoppingListSharingService);
  private readonly confirmDialogService = inject(ConfirmDialogService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly t = inject(I18n).t;

  protected readonly pendingRemovalUid = signal<string | null>(null);
  protected readonly revokeLink = signal(true);

  protected readonly members = computed<MemberView[]>(() => {
    const list = this.list();
    return list.memberIds
      .map((uid) => ({ uid, name: list.memberNames[uid] ?? uid, isOwner: uid === list.ownerId }))
      .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name));
  });

  protected startRemoval(uid: string): void {
    this.revokeLink.set(true);
    this.pendingRemovalUid.set(uid);
    this.focusAfterRender('.members__confirm input');
  }

  protected cancelRemoval(uid: string): void {
    this.pendingRemovalUid.set(null);
    this.focusAfterRender(`[data-member-uid="${uid}"] .icon-btn`);
  }

  protected onRevokeLinkChange(event: Event): void {
    this.revokeLink.set((event.target as HTMLInputElement).checked);
  }

  protected async confirmRemoval(uid: string): Promise<void> {
    const revokeLink = this.revokeLink();
    const removed = await this.sharingService.removeMember(this.list().id, uid, revokeLink);
    this.pendingRemovalUid.set(null);
    this.focusAfterRender('#members-heading');
    if (removed && revokeLink) {
      this.linkRevoked.emit();
    }
  }

  protected async leave(): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: this.t('share.leaveTitle'),
      message: this.t('share.leaveMessage'),
      confirmLabel: this.t('share.leaveConfirm'),
    });
    if (confirmed && (await this.sharingService.leave(this.list().id))) {
      this.left.emit();
    }
  }

  /** Keeps keyboard focus on a sensible element when the button that had it disappears. */
  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }
}
```

Run the members spec. Expected: PASS.

- [ ] **Step 4: Failing `ShareListDialog` spec**

```ts
import { Dialog } from '@angular/cdk/dialog';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { createFakeAuthService } from '../../../testing/fake-auth-service';
import { createFakeSharingService } from '../../../testing/fake-shopping-list-sharing-service';
import { buildShoppingList, provideFakeShoppingListsStore } from '../../../testing/in-memory-shopping-lists-store';
import { ShoppingListSharingService } from '../data/shopping-list-sharing.service';
import { ShareListDialog } from './share-list-dialog';

describe('ShareListDialog', () => {
  function setup(ownerId: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideFakeShoppingListsStore([
          buildShoppingList({
            ownerId,
            memberIds: ['test-uid', 'other-uid'],
            memberNames: { 'test-uid': 'Test User', 'other-uid': 'Other' },
          }),
        ]),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: ShoppingListSharingService, useValue: createFakeSharingService() },
      ],
    });
    return TestBed.inject(Dialog).open(ShareListDialog, { data: { listId: 'list-1' } });
  }

  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
    vi.restoreAllMocks();
  });

  it('shows the invite link and member management to the owner', async () => {
    setup('test-uid');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(document.querySelector('app-invite-link-panel')).not.toBeNull();
    expect(document.querySelector('button[aria-label="Remove Other"]')).not.toBeNull();
    expect(document.querySelector('h2')!.textContent).toContain('Share “Weekly groceries”');
  });

  it('shows members only the member list and Leave', async () => {
    setup('other-uid');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(document.querySelector('app-invite-link-panel')).toBeNull();
    expect(document.body.textContent).toContain('Leave list');
  });

  it('closes and navigates to the lists overview after leaving', async () => {
    const dialogRef = setup('other-uid');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const closed = vi.fn();
    dialogRef.closed.subscribe(closed);
    await TestBed.inject(ApplicationRef).whenStable();

    (dialogRef.componentInstance as unknown as { onLeft(): void }).onLeft();

    expect(closed).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/lists']);
  });
});
```

Run: `npx ng test --watch=false --include src/app/features/shopping-lists/share-list-dialog/share-list-dialog.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `ShareListDialog`**

```ts
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '../../../core/i18n/i18n.service';
import { ShoppingListsService } from '../data/shopping-lists.service';
import { InviteLinkPanel } from './invite-link-panel';
import { MembersPanel } from './members-panel';

export interface ShareListDialogData {
  readonly listId: string;
}

@Component({
  selector: 'app-share-list-dialog',
  imports: [InviteLinkPanel, MembersPanel],
  template: `
    <div class="add-panel share-dialog">
      <div class="add-panel__header">
        <h2 id="share-dialog-title">{{ t('share.title', { name: list()?.name ?? '' }) }}</h2>
        <button type="button" class="icon-btn" (click)="close()" [attr.aria-label]="t('share.close')">
          <svg
            class="icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      @if (list(); as current) {
        @if (isOwner()) {
          <app-invite-link-panel [listId]="current.id" [version]="linkVersion()" />
        }
        <app-members-panel
          [list]="current"
          [canManage]="isOwner()"
          (left)="onLeft()"
          (linkRevoked)="linkVersion.update((version) => version + 1)"
        />
      }
    </div>
  `,
  styles: `
    .share-dialog {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      max-width: 32rem;
    }
  `,
})
export class ShareListDialog {
  private readonly data = inject<ShareListDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef);
  private readonly router = inject(Router);
  private readonly shoppingListsService = inject(ShoppingListsService);
  protected readonly t = inject(I18n).t;

  protected readonly list = computed(() =>
    this.shoppingListsService.lists().find((list) => list.id === this.data.listId),
  );
  protected readonly isOwner = computed(() => {
    const list = this.list();
    return !!list && this.shoppingListsService.isOwner(list);
  });
  protected readonly linkVersion = signal(0);

  protected close(): void {
    this.dialogRef.close();
  }

  protected onLeft(): void {
    this.dialogRef.close();
    void this.router.navigate(['/lists']);
  }
}
```

Run the dialog spec. Expected: PASS.

- [ ] **Step 6: Failing detail-page tests**

In `shopping-list-detail.spec.ts`:
- In both `configureTestingModule` calls add `{ provide: ShoppingListSharingService, useValue: createFakeSharingService() },`.
- In the three existing Web Share/download tests change `'button[aria-label="Share Weekly groceries"]'` to `'button[aria-label="Export Weekly groceries"]'`.
- Add to the first `describe`:

```ts
  it('opens the share dialog from the Share button', async () => {
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    const list = shoppingListsService.addList('Weekly groceries');
    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', list.id);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Share Weekly groceries"]')!
      .click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(document.querySelector('app-share-list-dialog')).not.toBeNull();
    TestBed.inject(Dialog).closeAll();
  });

  it('switches to "List not found" when the list disappears while open (removed member)', () => {
    const shoppingListsService = TestBed.inject(ShoppingListsService);
    const list = shoppingListsService.addList('Weekly groceries');
    const fixture = TestBed.createComponent(ShoppingListDetail);
    fixture.componentRef.setInput('id', list.id);
    fixture.detectChanges();

    TestBed.inject(SHOPPING_LISTS_STORE).removeList(list.id);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('List not found');
  });
```

(Imports: `Dialog` from `@angular/cdk/dialog`, `SHOPPING_LISTS_STORE` from `../data/shopping-lists.store`, `ShoppingListSharingService`, `createFakeSharingService`.)

Run: `npx ng test --watch=false --include src/app/features/shopping-lists/shopping-list-detail/shopping-list-detail.spec.ts`
Expected: FAIL — no "Export …" button, share dialog not opened.

- [ ] **Step 7: Wire the detail page**

In `shopping-list-detail.ts`:
- Rename the existing button's handler and labels: `(click)="exportList()"`, `[attr.aria-label]="t('listDetail.exportFor', { name: currentList.name })"`, text `{{ t('listDetail.export') }}`. Keep its icon but switch to a download icon:

```html
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
```

- Rename the method `shareList()` → `exportList()`.
- Add a new button between the status button and the export button, reusing the existing share icon:

```html
            <button
              type="button"
              class="btn-outline-pill"
              (click)="openShareDialog()"
              [attr.aria-label]="t('listDetail.shareFor', { name: currentList.name })"
            >
              <svg
                class="icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              {{ t('listDetail.share') }}
            </button>
```

- In the class add `private readonly dialog = inject(Dialog);` (import `Dialog` from `@angular/cdk/dialog`, `ShareListDialog, ShareListDialogData` from `../share-list-dialog/share-list-dialog`) and:

```ts
  protected openShareDialog(): void {
    this.dialog.open<void, ShareListDialogData>(ShareListDialog, {
      data: { listId: this.id() },
      ariaLabelledBy: 'share-dialog-title',
    });
  }
```

- [ ] **Step 8: Run all shopping-list specs**

Run: `npx ng test --watch=false`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app
git commit -m "feat(shopping-lists): add share dialog with members management

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Join route

**Files:**
- Create: `src/app/features/shopping-lists/join-list/join-list.ts` + `.spec.ts`
- Modify: `src/app/features/shopping-lists/shopping-lists.routes.ts`
- Modify: `src/app/app.spec.ts`
- Modify: `en.ts`, `pl.ts`

**Interfaces:**
- Consumes: `ShoppingListSharingService.join(listId, token): Promise<JoinResult>`.
- Produces: route `/lists/join/:listId/:token` (inputs bound by `withComponentInputBinding()`).

- [ ] **Step 1: Translations**

`en.ts`:

```ts
  'join.joining': 'Joining the list…',
  'join.invalidTitle': 'This link is no longer active',
  'join.invalidMessage': 'Ask the list owner for a new link.',
  'join.failedTitle': "Couldn't join the list",
  'join.goToLists': 'Go to lists',
```

`pl.ts`:

```ts
  'join.joining': 'Dołączanie do listy…',
  'join.invalidTitle': 'Ten link jest nieaktywny',
  'join.invalidMessage': 'Poproś właściciela listy o nowy link.',
  'join.failedTitle': 'Nie udało się dołączyć do listy',
  'join.goToLists': 'Przejdź do list',
```

- [ ] **Step 2: Failing spec**

```ts
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { createFakeSharingService } from '../../../testing/fake-shopping-list-sharing-service';
import { JoinResult, ShoppingListSharingService } from '../data/shopping-list-sharing.service';
import { JoinList } from './join-list';

describe('JoinList', () => {
  let sharing: ShoppingListSharingService;

  beforeEach(() => {
    sharing = createFakeSharingService();
    TestBed.configureTestingModule({
      imports: [JoinList],
      providers: [provideRouter([]), { provide: ShoppingListSharingService, useValue: sharing }],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  async function render(result: JoinResult) {
    const join = vi.spyOn(sharing, 'join').mockResolvedValue(result);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(JoinList);
    fixture.componentRef.setInput('listId', 'list-1');
    fixture.componentRef.setInput('token', 'token-1');
    fixture.autoDetectChanges();
    await TestBed.inject(ApplicationRef).whenStable();
    return { join, navigate, root: fixture.nativeElement as HTMLElement };
  }

  it('shows a status message while joining', () => {
    vi.spyOn(sharing, 'join').mockReturnValue(new Promise(() => undefined));
    const fixture = TestBed.createComponent(JoinList);
    fixture.componentRef.setInput('listId', 'list-1');
    fixture.componentRef.setInput('token', 'token-1');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="status"]')!.textContent).toContain(
      'Joining the list',
    );
  });

  for (const result of ['joined', 'already-member'] as const) {
    it(`opens the list, replacing the join URL, when the result is ${result}`, async () => {
      const { join, navigate } = await render(result);

      expect(join).toHaveBeenCalledWith('list-1', 'token-1');
      expect(navigate).toHaveBeenCalledWith(['/lists', 'list-1'], { replaceUrl: true });
    });
  }

  it('explains an inactive link and offers a way back', async () => {
    const { navigate, root } = await render('invalid-link');

    expect(navigate).not.toHaveBeenCalled();
    expect(root.textContent).toContain('This link is no longer active');
    expect(root.querySelector('a[href="/lists"]')).not.toBeNull();
  });

  it('shows a failure message for unexpected errors', async () => {
    const { root } = await render('failed');

    expect(root.textContent).toContain("Couldn't join the list");
  });
});
```

Add to `app.spec.ts` (imports: `User` type from `firebase/auth`):

```ts
  it('keeps an invite URL across sign-in so the join still runs', async () => {
    const auth = createFakeAuthService(null);
    TestBed.overrideProvider(AuthService, { useValue: auth });
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/lists/join/list-1/token-1');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-sign-in-screen')).not.toBeNull();

    auth.setUser({ uid: 'u1' } as User);
    fixture.detectChanges();

    expect(router.url).toBe('/lists/join/list-1/token-1');
    expect((fixture.nativeElement as HTMLElement).querySelector('router-outlet')).not.toBeNull();
  });
```

Run: `npx ng test --watch=false --include src/app/features/shopping-lists/join-list/join-list.spec.ts --include src/app/app.spec.ts`
Expected: JoinList spec FAILS (module not found). The app test may already pass; if it fails, that is a real bug in the sign-in gate to fix before going on.

- [ ] **Step 3: Implement `JoinList`**

```ts
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n } from '../../../core/i18n/i18n.service';
import { ShoppingListSharingService } from '../data/shopping-list-sharing.service';

type JoinState = 'joining' | 'invalid' | 'failed';

@Component({
  selector: 'app-join-list',
  imports: [RouterLink],
  template: `
    <div class="page">
      @switch (state()) {
        @case ('joining') {
          <p role="status">{{ t('join.joining') }}</p>
        }
        @case ('invalid') {
          <div role="alert">
            <h1>{{ t('join.invalidTitle') }}</h1>
            <p>{{ t('join.invalidMessage') }}</p>
          </div>
          <a class="btn-accent-pill-lg" routerLink="/lists">{{ t('join.goToLists') }}</a>
        }
        @case ('failed') {
          <div role="alert">
            <h1>{{ t('join.failedTitle') }}</h1>
          </div>
          <a class="btn-accent-pill-lg" routerLink="/lists">{{ t('join.goToLists') }}</a>
        }
      }
    </div>
  `,
})
export class JoinList implements OnInit {
  readonly listId = input.required<string>();
  readonly token = input.required<string>();

  private readonly sharingService = inject(ShoppingListSharingService);
  private readonly router = inject(Router);
  protected readonly t = inject(I18n).t;
  protected readonly state = signal<JoinState>('joining');

  ngOnInit(): void {
    void this.join();
  }

  private async join(): Promise<void> {
    const result = await this.sharingService.join(this.listId(), this.token());
    if (result === 'joined' || result === 'already-member') {
      await this.router.navigate(['/lists', this.listId()], { replaceUrl: true });
      return;
    }
    this.state.set(result === 'invalid-link' ? 'invalid' : 'failed');
  }
}
```

- [ ] **Step 4: Register the route**

`shopping-lists.routes.ts`:

```ts
export const SHOPPING_LISTS_ROUTES: Routes = [
  { path: '', component: ShoppingListsOverview },
  {
    path: 'join/:listId/:token',
    loadComponent: () => import('./join-list/join-list').then((m) => m.JoinList),
  },
  { path: ':id', component: ShoppingListDetail },
];
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx ng test --watch=false --include src/app/features/shopping-lists/join-list/join-list.spec.ts --include src/app/app.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app
git commit -m "feat(shopping-lists): add invite link join route

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Overview — shared captions and owner-only actions

**Files:**
- Modify: `src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.ts` + `.spec.ts`
- Modify: `en.ts`, `pl.ts`

**Interfaces:**
- Consumes: `ShoppingListsService.isOwner`, `buildShoppingList`, `provideFakeShoppingListsStore`.

- [ ] **Step 1: Translations**

`en.ts`: `'lists.sharedBy': 'Shared by {name}',` and `'lists.sharedWith': 'Shared · {count} other members',`
`pl.ts`: `'lists.sharedBy': 'Udostępniona przez: {name}',` and `'lists.sharedWith': 'Udostępniona · pozostali członkowie: {count}',`

- [ ] **Step 2: Failing tests**

Add to `shopping-lists-overview.spec.ts`:

```ts
  describe('shared lists', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideFakeShoppingListsStore([
            buildShoppingList({
              id: 'theirs',
              name: 'Ania groceries',
              ownerId: 'ania-uid',
              memberIds: ['ania-uid', 'test-uid'],
              memberNames: { 'ania-uid': 'Ania', 'test-uid': 'Test User' },
            }),
            buildShoppingList({
              id: 'mine-shared',
              name: 'Family groceries',
              memberIds: ['test-uid', 'a', 'b'],
              memberNames: { 'test-uid': 'Test User', a: 'A', b: 'B' },
            }),
            buildShoppingList({ id: 'mine', name: 'Private groceries' }),
          ]),
        ],
      });
    });

    function card(root: HTMLElement, name: string): HTMLElement {
      return Array.from(root.querySelectorAll<HTMLElement>('.list-card')).find((c) =>
        c.textContent?.includes(name),
      )!;
    }

    it('captions shared lists by owner or member count', () => {
      const fixture = TestBed.createComponent(ShoppingListsOverview);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;

      expect(card(root, 'Ania groceries').textContent).toContain('Shared by Ania');
      expect(card(root, 'Family groceries').textContent).toContain('Shared · 2 other members');
      expect(card(root, 'Private groceries').textContent).not.toContain('Shared');
    });

    it("hides rename and delete on someone else's list but keeps Mark complete", () => {
      const fixture = TestBed.createComponent(ShoppingListsOverview);
      fixture.detectChanges();
      const theirs = card(fixture.nativeElement as HTMLElement, 'Ania groceries');

      expect(theirs.querySelector('button[aria-label="Edit Ania groceries"]')).toBeNull();
      expect(theirs.querySelector('button[aria-label="Delete Ania groceries"]')).toBeNull();
      expect(theirs.querySelector('button[aria-label="Mark Ania groceries complete"]')).not.toBeNull();
    });
  });
```

Run: `npx ng test --watch=false --include src/app/features/shopping-lists/shopping-lists-overview/shopping-lists-overview.spec.ts`
Expected: FAIL — no captions, edit/delete still rendered.

- [ ] **Step 3: Implement**

In the class add:

```ts
  protected readonly ownedListIds = computed(
    () =>
      new Set(
        this.shoppingListsService
          .lists()
          .filter((list) => this.shoppingListsService.isOwner(list))
          .map((list) => list.id),
      ),
  );

  protected readonly sharedCaptions = computed(() => {
    const captions = new Map<ShoppingListId, string>();
    for (const list of this.shoppingListsService.lists()) {
      if (!this.ownedListIds().has(list.id)) {
        captions.set(list.id, this.t('lists.sharedBy', { name: list.memberNames[list.ownerId] ?? '' }));
      } else if (list.memberIds.length > 1) {
        captions.set(list.id, this.t('lists.sharedWith', { count: list.memberIds.length - 1 }));
      }
    }
    return captions;
  });
```

In **both** the active and completed card templates:
- After the `list-card__meta` "Added …" span, add:

```html
                    @if (sharedCaptions().get(list.id); as caption) {
                      <span class="list-card__meta list-card__shared">
                        <svg
                          class="icon icon--sm"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        {{ caption }}
                      </span>
                    }
```

- Wrap the edit (`startEdit`) and delete (`remove`) buttons in `@if (ownedListIds().has(list.id)) { ... }`.

Add to the component `styles`:

```css
    .list-card__shared {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
```

The caption text sits next to an `aria-hidden` icon, so screen readers read the text alone.

- [ ] **Step 4: Run to verify it passes**

Run: `npx ng test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app
git commit -m "feat(shopping-lists): mark shared lists and hide owner-only actions in overview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Full verification, accessibility and docs

**Files:**
- Modify: `docs/APPLICATION_OVERVIEW.md`

- [ ] **Step 1: Full gate**

Run: `firebase emulators:exec --only firestore,auth "npx ng test --watch=false"`
Expected: all specs PASS; the output shows rules, store and sharing-service specs executed, not skipped.
Run: `npx ng lint` and `npx ng build`
Expected: no errors.

- [ ] **Step 2: Manual two-account check (emulator)**

1. `npm run emulators` and `npm start`.
2. Browser A (normal window): sign in as user A in the Auth emulator popup, create "Test list", add two items, open Share, copy the link.
3. Browser B (private window): open the link, sign in as user B. Expect to land on "Test list".
4. A checks item 1 while B adds item 3 at the same time: both browsers show item 1 checked and item 3 present.
5. B: overview shows "Shared by A", no edit/delete icons. B marks the list completed; A sees it move to Completed.
6. A: Share → remove B with "Also invalidate" checked. B's open detail page switches to "List not found"; reopening the old link in B shows "This link is no longer active".
7. A: generate a new link; B joins again; B uses Share → Leave list and lands on `/lists` without the list.

Write down anything that deviates and fix it before continuing.

- [ ] **Step 3: Accessibility**

With Chrome DevTools MCP or the axe browser extension, run AXE on: overview (with a shared list), detail, the open share dialog (owner and member views), and the join page in the invalid-link state. Expected: zero violations. Also check keyboard-only: Tab reaches every control in the dialog, Esc closes it, focus returns to the Share button, and after "Remove" focus lands on the "People with access" heading.

- [ ] **Step 4: Document the feature**

In `docs/APPLICATION_OVERVIEW.md`, in the shopping lists section, add a short "Sharing" subsection: the owner shares a list through an invite link from the list's Share dialog; anyone signed in who opens the link joins; members can edit items and the list's status but not rename or delete it, and can leave; the owner can remove members and generate a new link. Mention that the file Export/Import is unchanged.

- [ ] **Step 5: Commit**

```bash
git add docs/APPLICATION_OVERVIEW.md
git commit -m "docs: describe shopping list sharing between accounts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Hand back**

Report the test/lint/build results and the manual and AXE outcomes. Remind the project owner that `firestore.rules` must be deployed together with the app (`firebase deploy --only firestore:rules,hosting`). That deploy is theirs to run.
