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
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { I18n } from '../i18n/i18n.service';

export interface FirestoreCollection<T> {
  readonly items: Signal<readonly T[]>;
  add(item: T): void;
  update(id: string, changes: Partial<T>): void;
  remove(id: string): void;
}

export interface FirestoreCollectionConfig {
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
  config: FirestoreCollectionConfig,
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

  /**
   * `doc(firestore, path)` (no collection reference in hand yet) always
   * types as `DocumentReference<DocumentData, DocumentData>` — there is no
   * generic overload for that call shape. Asserting it as `T`'s own
   * `DocumentReference` here is what lets `setDoc`/`updateDoc`/`deleteDoc`
   * type-check against `T` below.
   */
  function docRef(uid: string, id: string): DocumentReference<T, T> {
    return doc(firestore, config.docPath(uid, id)) as DocumentReference<T, T>;
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
      setDoc(docRef(uid, item.id), item).catch(reportError);
    },
    update: (id: string, changes: Partial<T>) => {
      const uid = authService.uid();
      if (!uid) {
        reportError();
        return;
      }
      updateDoc(docRef(uid, id), changes as UpdateData<T>).catch(reportError);
    },
    remove: (id: string) => {
      const uid = authService.uid();
      if (!uid) {
        reportError();
        return;
      }
      deleteDoc(docRef(uid, id)).catch(reportError);
    },
  };
}
