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
