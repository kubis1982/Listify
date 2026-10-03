import { createFakeAuthService } from './fake-auth-service';

describe('createFakeAuthService', () => {
  it('defaults to a signed-in fake user', () => {
    const fake = createFakeAuthService();
    expect(fake.uid()).toBe('test-uid');
    expect(fake.user()).toEqual(expect.objectContaining({ uid: 'test-uid' }));
  });

  it('can start signed out', () => {
    const fake = createFakeAuthService(null);
    expect(fake.uid()).toBeNull();
    expect(fake.user()).toBeNull();
  });

  it('lets a test flip the signed-in state', () => {
    const fake = createFakeAuthService(null);
    fake.setUser({ uid: 'later-uid' } as never);
    expect(fake.uid()).toBe('later-uid');
  });

  it('signInWithGoogle and signOut resolve without doing anything', async () => {
    const fake = createFakeAuthService();
    await expect(fake.signInWithGoogle()).resolves.toBeUndefined();
    await expect(fake.signOut()).resolves.toBeUndefined();
  });
});
