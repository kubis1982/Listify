import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FabPanel } from './fab-panel';

describe('FabPanel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FabPanel] });
  });

  function createFixture() {
    const fixture = TestBed.createComponent(FabPanel);
    fixture.componentRef.setInput('title', 'Add item');
    fixture.componentRef.setInput('fabLabel', 'Add item');
    fixture.detectChanges();
    return fixture;
  }

  it('opens the panel when the fab button is clicked', () => {
    const fixture = createFixture();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    expect(root.querySelector('.add-panel')).not.toBeNull();
    expect(fixture.componentInstance.open()).toBe(true);
  });

  it('closes the panel when open is set to false externally', () => {
    const fixture = createFixture();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();

    expect(root.querySelector('.add-panel')).toBeNull();
  });

  it('emits cancelled when Escape is pressed while open', () => {
    const fixture = createFixture();
    const root = fixture.nativeElement as HTMLElement;
    const cancelledSpy = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelledSpy);

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(cancelledSpy).toHaveBeenCalledTimes(1);
  });

  it('does not emit cancelled when Escape is pressed while closed', () => {
    const fixture = createFixture();
    const cancelledSpy = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelledSpy);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(cancelledSpy).not.toHaveBeenCalled();
  });
});
