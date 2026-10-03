import {
  JoinResult,
  ShoppingListSharingService,
} from '../features/shopping-lists/data/shopping-list-sharing.service';

/** Resolves every call successfully; specs override single methods with vi.spyOn. */
export function createFakeSharingService(): ShoppingListSharingService {
  return {
    getInviteLink: (listId: string) => Promise.resolve(`https://listify.test/lists/join/${listId}/token-1`),
    regenerateInviteLink: (listId: string) =>
      Promise.resolve(`https://listify.test/lists/join/${listId}/token-2`),
    join: () => Promise.resolve<JoinResult>('joined'),
    leave: () => Promise.resolve(true),
    removeMember: () => Promise.resolve(true),
  } as unknown as ShoppingListSharingService;
}
