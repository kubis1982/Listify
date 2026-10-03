import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
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

  it('denies creating a list whose owner display name is empty or over 100 chars', async () => {
    for (const name of ['', 'x'.repeat(101)]) {
      const data = shoppingListDoc(owner, { memberNames: { [owner.uid]: name } });

      expect(await errorCode(setDoc(doc(owner.firestore, 'shoppingLists', data.id), data))).toBe(
        'permission-denied',
      );
    }
  });

  it('denies the owner renaming their own memberNames entry', async () => {
    const id = await createList();

    const rename = updateDoc(doc(owner.firestore, 'shoppingLists', id), {
      [`memberNames.${owner.uid}`]: 'Renamed',
    });

    expect(await errorCode(rename)).toBe('permission-denied');
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

  function join(
    user: EmulatorUser,
    listId: string,
    token: string,
    uidToAdd = user.uid,
    name = 'Joined',
  ): Promise<void> {
    const batch = writeBatch(user.firestore);
    batch.set(doc(user.firestore, `shoppingLists/${listId}/joins/${user.uid}`), { token });
    batch.update(listRef(user, listId), {
      memberIds: arrayUnion(uidToAdd),
      [`memberNames.${uidToAdd}`]: name,
    });
    return batch.commit();
  }

  // Joins WITHOUT writing joins/{uid}: isJoin's token check then relies on
  // whatever joins doc already exists.
  function joinUpdateOnly(user: EmulatorUser, listId: string): Promise<void> {
    return updateDoc(listRef(user, listId), {
      memberIds: arrayUnion(user.uid),
      [`memberNames.${user.uid}`]: 'Rejoined',
    });
  }

  function removeMemberUpdateOnly(actor: EmulatorUser, listId: string, uid: string): Promise<void> {
    return updateDoc(listRef(actor, listId), {
      memberIds: arrayRemove(uid),
      [`memberNames.${uid}`]: deleteField(),
    });
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

    it('denies members and strangers writing the token (pins isStoredListOwner on invite write)', async () => {
      const listId = await sharedList();

      for (const user of [member, stranger]) {
        const write = setDoc(doc(user.firestore, `shoppingLists/${listId}/invite/current`), {
          token: crypto.randomUUID(),
        });
        expect(await errorCode(write)).toBe('permission-denied');
      }
    });

    it('denies the owner writing a token of 31 or 65 chars (pins validStringLength 32-64)', async () => {
      const listId = await createList();

      for (const token of ['a'.repeat(31), 'a'.repeat(65)]) {
        const write = setDoc(doc(owner.firestore, `shoppingLists/${listId}/invite/current`), { token });
        expect(await errorCode(write)).toBe('permission-denied');
      }
    });

    it("denies the owner writing an invite doc other than 'current' (pins inviteId == 'current')", async () => {
      const listId = await createList();

      const write = setDoc(doc(owner.firestore, `shoppingLists/${listId}/invite/other`), {
        token: crypto.randomUUID(),
      });

      expect(await errorCode(write)).toBe('permission-denied');
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

  describe('joining — token check and validation', () => {
    it('denies a join that has no joins/{uid} write (pins isJoin token check via getAfter)', async () => {
      const listId = await createList();
      await setInvite(listId);

      expect(await errorCode(joinUpdateOnly(stranger, listId))).toBe('permission-denied');
    });

    it('denies an update-only re-join once the token was regenerated (stale joins doc)', async () => {
      const listId = await createList();
      await join(member, listId, await setInvite(listId));
      await removeMemberUpdateOnly(owner, listId, member.uid);

      // Control: the stale joins doc still carries the current token, so this is allowed.
      expect(await errorCode(joinUpdateOnly(member, listId))).toBeNull();

      await removeMemberUpdateOnly(owner, listId, member.uid);
      await setInvite(listId);

      expect(await errorCode(joinUpdateOnly(member, listId))).toBe('permission-denied');
    });

    it('denies a join with an empty or over-100-char display name (pins isJoin validStringLength)', async () => {
      const listId = await createList();
      const token = await setInvite(listId);

      expect(await errorCode(join(member, listId, token, member.uid, ''))).toBe('permission-denied');
      expect(await errorCode(join(member, listId, token, member.uid, 'x'.repeat(101)))).toBe('permission-denied');
    });

    it('denies writing joins/{someoneElse} even with the valid token (pins joins create auth.uid == memberId)', async () => {
      const listId = await createList();
      const token = await setInvite(listId);

      const forged = setDoc(doc(stranger.firestore, `shoppingLists/${listId}/joins/${member.uid}`), { token });

      expect(await errorCode(forged)).toBe('permission-denied');
    });

    it('denies the 21st member joining (pins isValidMemberIds size <= 20)', async () => {
      const listId = await createList();
      const token = await setInvite(listId);
      const extra: EmulatorUser[] = [];
      try {
        for (let i = 0; i < 19; i++) {
          const user = await createEmulatorUser(`Extra ${i}`);
          extra.push(user);
          await join(user, listId, token);
        }

        expect(await errorCode(join(member, listId, token))).toBe('permission-denied');
      } finally {
        await Promise.all(extra.map((user) => disposeEmulatorUser(user)));
      }
    }, 120_000);
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

    it('denies a member removing another non-owner member (pins isLeave removeAll([auth.uid]))', async () => {
      const listId = await createList();
      const token = await setInvite(listId);
      await join(member, listId, token);
      await join(stranger, listId, token);

      expect(await errorCode(removeMemberUpdateOnly(member, listId, stranger.uid))).toBe('permission-denied');
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
