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
