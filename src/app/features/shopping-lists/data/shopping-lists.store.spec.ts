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
