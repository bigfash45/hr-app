import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Keeps keyboard focus inside the host element while it is in the DOM, and
 * returns focus to whatever was focused before it opened.
 *
 * Required by WCAG 2.1 AA (PRD §10.3): a modal that lets Tab escape into the
 * page behind it is unusable with a keyboard or screen reader.
 *
 * Hand-rolled rather than pulled from @angular/cdk/a11y to avoid adding a
 * dependency. If we later adopt the CDK for overlays, swap this for cdkTrapFocus.
 */
@Directive({
  selector: '[appFocusTrap]',
  standalone: true,
  host: {
    '(keydown.Tab)': 'onTab($event)',
    '(keydown.shift.Tab)': 'onTab($event)',
  },
})
export class FocusTrapDirective implements AfterViewInit, OnDestroy {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private previouslyFocused: HTMLElement | null = null;

  ngAfterViewInit(): void {
    this.previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus the first control, or the container itself if there is nothing to
    // focus, so the screen reader lands inside the dialog rather than behind it.
    const first = this.focusable()[0] ?? this.host.nativeElement;
    if (!first.hasAttribute('tabindex') && first === this.host.nativeElement) {
      first.setAttribute('tabindex', '-1');
    }
    first.focus();
  }

  ngOnDestroy(): void {
    // Guard against the trigger having been removed while the dialog was open.
    if (this.previouslyFocused?.isConnected) {
      this.previouslyFocused.focus();
    }
  }

  protected onTab(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    const items = this.focusable();
    if (items.length === 0) {
      keyboardEvent.preventDefault();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if (keyboardEvent.shiftKey && (active === first || active === this.host.nativeElement)) {
      keyboardEvent.preventDefault();
      last.focus();
    } else if (!keyboardEvent.shiftKey && active === last) {
      keyboardEvent.preventDefault();
      first.focus();
    }
  }

  private focusable(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      el => el.offsetParent !== null || el === document.activeElement
    );
  }
}
