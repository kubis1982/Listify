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
