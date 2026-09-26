import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { createFakeAuthService } from '../../testing/fake-auth-service';
import { FIRESTORE } from '../firebase/firebase.providers';

interface SnapshotLike {
  docs: { id: string; data: () => unknown }[];
}
type OnNext = (snapshot: SnapshotLike) => void;
type OnError = (error: unknown) => void;

let capturedOnNext: OnNext | undefined;
let capturedOnError: OnError | undefined;

// This spec never talks to a real or emulated Firestore — it mocks the SDK
// so the onSnapshot error-callback path (untestable via the synchronous
// in-memory fake, and normally only exercised by the Java-gated emulator
// suite) is verified by the fast, always-run test suite too.
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn((_query: unknown, onNext: OnNext, onError: OnError) => {
    capturedOnNext = onNext;
    capturedOnError = onError;
    return () => undefined;
  }),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
}));

import { createFirestoreCollection } from './firestore-collection';

interface Widget {
  id: string;
  name: string;
}

describe('createFirestoreCollection (read-error handling, mocked SDK)', () => {
  beforeEach(() => {
    capturedOnNext = undefined;
    capturedOnError = undefined;
    TestBed.configureTestingModule({
      providers: [
        { provide: FIRESTORE, useValue: {} },
        { provide: AuthService, useValue: createFakeAuthService('uid-1') },
      ],
    });
  });

  it('reports an error and leaves items at their last-known value when the snapshot listener errors', async () => {
    const confirmDialogService = TestBed.inject(ConfirmDialogService);
    const alertSpy = vi.spyOn(confirmDialogService, 'alert').mockResolvedValue();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const widgets = TestBed.runInInjectionContext(() =>
      createFirestoreCollection<Widget>({
        query: () => ({}) as never,
        docPath: (uid, id) => `widgets/${id}`,
      }),
    );

    await TestBed.inject(ApplicationRef).whenStable();
    expect(capturedOnNext).toBeDefined();
    expect(capturedOnError).toBeDefined();

    capturedOnNext!({ docs: [{ id: 'w1', data: () => ({ name: 'Widget' }) }] });
    expect(widgets.items()).toEqual([{ id: 'w1', name: 'Widget' }]);

    expect(alertSpy).not.toHaveBeenCalled();
    const listenError = new Error('permission-denied');
    capturedOnError!(listenError);

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(widgets.items()).toEqual([{ id: 'w1', name: 'Widget' }]);
    expect(consoleErrorSpy).toHaveBeenCalledWith('[Firestore]', listenError);
  });
});
