import { DOCUMENT, inject, Service } from '@angular/core';
import {
  arrayRemove,
  arrayUnion,
  deleteField,
  doc,
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
      // Matched on `code`, not instanceof: the error class can come from another module instance.
      const code = (error as { code?: string }).code;
      if (code === 'permission-denied' || code === 'not-found') {
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
