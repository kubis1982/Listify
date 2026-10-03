import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { createFakeSharingService } from '../../../testing/fake-shopping-list-sharing-service';
import { JoinResult, ShoppingListSharingService } from '../data/shopping-list-sharing.service';
import { JoinList } from './join-list';

describe('JoinList', () => {
  let sharing: ShoppingListSharingService;

  beforeEach(() => {
    sharing = createFakeSharingService();
    TestBed.configureTestingModule({
      imports: [JoinList],
      providers: [provideRouter([]), { provide: ShoppingListSharingService, useValue: sharing }],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  async function render(result: JoinResult) {
    const join = vi.spyOn(sharing, 'join').mockResolvedValue(result);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(JoinList);
    fixture.componentRef.setInput('listId', 'list-1');
    fixture.componentRef.setInput('token', 'token-1');
    fixture.autoDetectChanges();
    await join.mock.results[0].value;
    await Promise.resolve();
    await TestBed.inject(ApplicationRef).whenStable();
    return { join, navigate, root: fixture.nativeElement as HTMLElement };
  }

  it('shows a status message while joining', () => {
    vi.spyOn(sharing, 'join').mockReturnValue(new Promise(() => undefined));
    const fixture = TestBed.createComponent(JoinList);
    fixture.componentRef.setInput('listId', 'list-1');
    fixture.componentRef.setInput('token', 'token-1');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="status"]')!.textContent).toContain(
      'Joining the list',
    );
  });

  for (const result of ['joined', 'already-member'] as const) {
    it(`opens the list, replacing the join URL, when the result is ${result}`, async () => {
      const { join, navigate } = await render(result);

      expect(join).toHaveBeenCalledWith('list-1', 'token-1');
      expect(navigate).toHaveBeenCalledWith(['/lists', 'list-1'], { replaceUrl: true });
    });
  }

  it('explains an inactive link and offers a way back', async () => {
    const { navigate, root } = await render('invalid-link');

    expect(navigate).not.toHaveBeenCalled();
    expect(root.textContent).toContain('This link is no longer active');
    expect(root.querySelector('a[href="/lists"]')).not.toBeNull();
  });

  it('shows a failure message for unexpected errors', async () => {
    const { root } = await render('failed');

    expect(root.textContent).toContain("Couldn't join the list");
  });
});
