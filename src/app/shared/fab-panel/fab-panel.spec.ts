import { TestBed } from '@angular/core/testing';
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

  it('closes the panel when its close button is clicked', () => {
    const fixture = createFixture();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    root.querySelector<HTMLButtonElement>('button[aria-label="Close form"]')!.click();
    fixture.detectChanges();

    expect(root.querySelector('.add-panel')).toBeNull();
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('prevents the default mousedown action on the close button so it never steals focus from the form', () => {
    const fixture = createFixture();
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.fab')!.click();
    fixture.detectChanges();

    const closeButton = root.querySelector<HTMLButtonElement>('button[aria-label="Close form"]')!;
    const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    closeButton.dispatchEvent(mousedownEvent);

    expect(mousedownEvent.defaultPrevented).toBe(true);
  });
});
