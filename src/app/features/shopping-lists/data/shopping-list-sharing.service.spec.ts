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
