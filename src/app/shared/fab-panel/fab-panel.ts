import { Component, input, model, output } from '@angular/core';

@Component({
  selector: 'app-fab-panel',
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    <div class="fab-wrap">
      @if (open()) {
        <div class="add-panel">
          <div class="add-panel__header">
            <h2>{{ title() }}</h2>
          </div>
          <ng-content />
        </div>
      }
      <button
        type="button"
        class="fab"
        (click)="toggle()"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="fabLabel()"
      >
        <svg
          class="icon icon--lg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  `,
})
export class FabPanel {
  readonly title = input.required<string>();
  readonly fabLabel = input.required<string>();
  readonly open = model(false);
  readonly cancelled = output<void>();

  protected toggle(): void {
    this.open.update((isOpen) => !isOpen);
  }

  protected onEscape(): void {
    if (this.open()) {
      this.cancelled.emit();
    }
  }
}
