import { TestBed } from '@angular/core/testing';
import { FIREBASE_APP, FIRESTORE, FIREBASE_AUTH } from './firebase.providers';

describe('Firebase providers', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('provides a FirebaseApp for the configured project', () => {
    const app = TestBed.inject(FIREBASE_APP);
    expect(app.options.projectId).toBe('listify-9658c');
  });

  it('provides a Firestore instance backed by the same app', () => {
    const firestore = TestBed.inject(FIRESTORE);
    expect(firestore.app).toBe(TestBed.inject(FIREBASE_APP));
  });

  it('provides an Auth instance backed by the same app', () => {
    const auth = TestBed.inject(FIREBASE_AUTH);
    expect(auth.app).toBe(TestBed.inject(FIREBASE_APP));
  });
});
