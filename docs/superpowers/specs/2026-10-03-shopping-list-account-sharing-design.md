# Shopping List Sharing Between Accounts — Design Spec

Date: 2026-10-03

## Problem

Shopping lists live under `users/{uid}/shoppingLists`, so each list is
visible to exactly one Google account. The existing "Share" button only
exports a JSON file; importing it creates an independent copy. Two people
can't work on the same list (one adds products at home, the other checks
them off in the shop).

An earlier attempt (`ownerId`/`memberIds` on a top-level collection,
reverted in `e5a0ebf`) shipped Firestore rules that were never exercised
against a real rules engine, and list creation broke in production. The
key constraint for this design: **every rule and query shape is covered
by emulator-backed tests before deployment.**

## Goals

- The owner of a list can share it via a reusable invite link.
- A signed-in user who opens the link becomes a member and sees the same
  list, with live updates on both sides.
- The owner sees members, can remove any of them, and can regenerate the
  link (invalidating the old one).
- A member can leave a list.
- Concurrent edits of different items by different people never overwrite
  each other, including offline (the app uses `persistentLocalCache`).

## Non-goals

- Inviting by e-mail / a user directory.
- One-time or expiring links.
- Transferring ownership.
- Migrating existing data in `users/{uid}/shoppingLists` (decision: no
  production data worth keeping; the old path is simply abandoned).
- Cloud Functions or any other backend.

## Decisions

| Question | Decision |
|---|---|
| How the owner points at another account | Invite link `/lists/join/{listId}/{token}` |
| Member permissions | Add/edit/remove/check items and change list `status`. No rename, no delete, no access management. Can leave. |
| Link lifecycle | One reusable link per list; owner can regenerate it; existing members keep access |
| Existing data | Not migrated |
| Architecture | Top-level `shoppingLists` collection, `array-contains` query, join via a batch verified in rules with `getAfter()` |
| Removed member with the old link | Can rejoin until the link is regenerated; the "Remove member" dialog has "Also invalidate link" checked by default |
| Items storage | `map<itemId, item>` instead of an array, so writes are per-item |

## Data model

### `shoppingLists/{listId}`

| Field | Type | Notes |
|---|---|---|
| `id` | string | immutable, equals `listId` |
| `name` | string | 1–200 chars |
| `createdAt` | string | ISO 8601, immutable |
| `status` | `'active' \| 'completed'` | |
| `items` | `map<itemId, ShoppingListItem>` | ≤ 500 entries; per-item shape enforced by the TS layer (rules `.all()` is unreliable, see `firestore.rules`) |
| `ownerId` | string | immutable, the creator's uid |
| `memberIds` | `list<string>` | contains `ownerId`; 1–20 entries |
| `memberNames` | `map<uid, string>` | display name (Google `displayName`, else e-mail); each user writes only their own entry; keys match `memberIds` |

Consequence accepted by the owner: members of a list see each other's
display names / e-mails.

### `shoppingLists/{listId}/invite/current`

`{ token: string }` — a `crypto.randomUUID()`. Owner-only read/write.
Created lazily on the first "Share" click; "Regenerate link" overwrites it.

### `shoppingLists/{listId}/joins/{uid}`

`{ token: string }` — proof that `uid` knows the current token. Only `uid`
itself may create/overwrite it, and only with `token ==
invite/current.token`. Owner or `uid` may delete it.

## Security rules

Rules for the list document:

| Operation | Who | Condition |
|---|---|---|
| read (incl. `array-contains` query) | member | `request.auth.uid in resource.data.memberIds` |
| create | any signed-in user | valid list; `ownerId == auth.uid`; `memberIds == [auth.uid]`; `memberNames.keys() == [auth.uid]` |
| update | owner | valid list; `id`, `createdAt`, `ownerId` unchanged; new `memberIds` is a subset of the old one and still contains `ownerId`; `memberNames` keys match `memberIds` |
| update | member (not owner) | `affectedKeys().hasOnly(['items', 'status'])`; valid list |
| update — join | non-member | `affectedKeys().hasOnly(['memberIds', 'memberNames'])`; new `memberIds == old + [auth.uid]`; only `memberNames[auth.uid]` added (string, 1–100 chars); `getAfter(joins/{auth.uid}).data.token == get(invite/current).data.token`; size ≤ 20 |
| update — leave | member, not owner | `affectedKeys().hasOnly(['memberIds', 'memberNames'])`; new `memberIds == old.removeAll([auth.uid])`; `memberNames[auth.uid]` removed, nothing else changed |
| delete | owner | — |

Subcollections: `invite/current` — owner only (`get(list).ownerId ==
auth.uid`). `joins/{uid}` — create/update by `uid` with the current token;
delete by `uid` or owner; read by `uid` or owner.

`users/{uid}/shoppingLists/**` — `allow read, write: if false`.

## Data layer

### `core/storage/firestore-collection.ts`

- Config gains optional `fromFirestore(data, id): T` and
  `toFirestore(item: T): DocumentData` for documents whose stored shape
  differs from the app model.
- `update(id, changes)` accepts `UpdateData<DocumentData>` (field paths
  like `items.abc.purchased`), not only `Partial<T>`.
- Existing collections (categories, products, units) are unaffected.

### `features/shopping-lists/data/`

- `ShoppingList` model gains `ownerId`, `memberIds`, `memberNames`.
  `items: ShoppingListItem[]` stays an array in the app model; conversion
  to/from the stored map lives in a small pure module
  (`shopping-list-firestore.ts`).
- `SHOPPING_LISTS_COLLECTION`: `query(collection(fs, 'shoppingLists'),
  where('memberIds', 'array-contains', uid))`, `docPath: shoppingLists/{id}`.
- `ShoppingListsService`:
  - `addList` / `importList` set `ownerId`, `memberIds: [uid]`,
    `memberNames: { [uid]: name }` (injects `AuthService`).
  - Item methods write per item: add → `items.{id}`, check / edit →
    `items.{id}.purchased` / `.quantity` / `.note`, remove →
    `items.{id}: deleteField()`. Merging into an existing unpurchased item
    updates only its `quantity`.
  - `isOwner(list)` helper for the UI.
- Export (`toShoppingListExport`) does not include sharing fields.

### `ShoppingListSharingService` (new, `@Service()`)

Talks to Firestore directly because callers need operation results:

- `getInviteLink(listId): Promise<string>` — reads `invite/current`,
  creates it if missing, returns the absolute URL.
- `regenerateInviteLink(listId): Promise<string>`.
- `join(listId, token): Promise<'joined' | 'already-member' | 'invalid-link'>`
  — tries `getDoc` first (succeeds only for members → `already-member`);
  otherwise a `writeBatch`: set `joins/{uid}`, update list with
  `arrayUnion(uid)` and `memberNames.{uid}`. `permission-denied` maps to
  `invalid-link`.
- `leave(listId)`, `removeMember(listId, uid, revokeLink: boolean)`
  (removing also deletes `joins/{uid}`).
- Unexpected errors: `console.error` + the existing generic alert.

## UI

### Shopping list detail

- Existing file-export button is renamed **"Export"**; behavior unchanged.
- New **"Share"** button opens `ShareListDialog` (CDK Dialog).
  - Owner view: read-only link field, "Copy" (confirmation announced via
    `aria-live`), "Send" (`navigator.share({ url })`, only when supported),
    "Regenerate link" (confirm: old link stops working), member list with a
    remove button per member → confirm dialog with "Also invalidate link"
    checkbox (checked by default).
  - Member view: read-only member list (owner marked), "Leave list"
    (confirm, then navigate to `/lists`).
- Members don't see rename or delete actions; they do see complete/restore
  and item editing.
- A list that is no longer accessible falls into the existing "not found"
  view.

### Shopping lists overview

- Shared lists show a "shared" icon with text alternative and a caption:
  "from {ownerName}" for lists owned by someone else, "{n} people" for own
  shared lists.
- No delete action on lists owned by someone else.

### `/lists/join/:listId/:token` — `JoinList` (lazy-loaded)

- Shows "Joining…" (`role="status"`), calls `join()`.
- `joined` / `already-member` → `navigate(['/lists', listId], { replaceUrl: true })`.
- `invalid-link` → "This link is no longer active. Ask the owner for a new
  one." + "Go to lists" button.
- Signed-out users see the existing sign-in gate; the URL must survive
  sign-in (verify during implementation).

All new strings get `pl` and `en` translations.

## Accessibility

Dialogs reuse the CDK Dialog focus trap and labelled titles; icon-only
buttons have `aria-label`; status messages use `aria-live` / `role="status"`.
AXE check on the share dialog, join page, overview and detail.

## Testing

- **Rules (emulator)** — `firestore.rules.spec.ts`, same setup as
  `firestore-collection.spec.ts` (real SDK, `skipIf` when the emulator is
  down), several signed-in accounts (owner, member, stranger). Allowed and
  denied case for every row of the rules table, specifically:
  `array-contains` query as member vs stranger; join with current / wrong /
  old token; adding someone else's uid; member changing `name` or
  `ownerId`; owner adding a stranger uid; member reading `invite/current`;
  writing a non-empty `items` map (the shape that previously failed in
  production). Run via `npm run test:integration`, mandatory before
  deploying rules.
- **Unit** (existing fakes): per-item writes and sharing fields in
  `ShoppingListsService`; map ↔ array conversion; `permission-denied` →
  `invalid-link`; `ShareListDialog` owner vs member views; `JoinList`
  outcomes; hidden member actions in detail and overview.
- **Manual**: two accounts in the emulator, two browsers — share, join,
  concurrent edits of different items, remove member, regenerate link.

## Deployment

Rules and app ship together. Old `users/{uid}/shoppingLists` data stays in
the database but is unreachable.
