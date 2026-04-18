import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { TokenStore } from './token-store';
import { FeedbackService } from '../feedback/feedback.service';
import { DialogService } from '../feedback/dialog.service';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Enforces the session policy in PRD §6.1: an absolute lifetime (default 8h) and
 * an inactivity timeout (default 30min), with a warning before the idle deadline.
 *
 * The important requirement is the one that is easy to get wrong: re-authentication
 * must not lose page state. So idle expiry does NOT navigate to /auth/login —
 * it raises a blocking dialog over whatever the user was doing. The route, the
 * scroll position, and any half-filled form survive; only the token is replaced.
 *
 * Absolute expiry is different: there is no way to extend it, so that one does
 * end the session and return to login.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private auth = inject(AuthService);
  private tokens = inject(TokenStore);
  private feedback = inject(FeedbackService);
  private dialogs = inject(DialogService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  /** True while the re-authentication dialog is up. */
  readonly reauthRequired = signal(false);

  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private warningTimer: ReturnType<typeof setTimeout> | null = null;
  private absoluteTimer: ReturnType<typeof setTimeout> | null = null;
  private listening = false;

  private readonly onActivity = () => this.resetIdleTimers();

  /** Call once after a successful sign-in. */
  start(): void {
    this.stop();

    this.absoluteTimer = setTimeout(
      () => void this.endSession('Your session has reached its time limit. Sign in again to continue.'),
      environment.session.absoluteMs
    );

    this.resetIdleTimers();
    this.listen();

    this.destroyRef.onDestroy(() => this.stop());
  }

  stop(): void {
    this.clearTimer('idleTimer');
    this.clearTimer('warningTimer');
    this.clearTimer('absoluteTimer');
    this.unlisten();
    this.reauthRequired.set(false);
  }

  /** Any user interaction pushes the idle deadline back. */
  private resetIdleTimers(): void {
    if (!this.tokens.isAuthenticated() || this.reauthRequired()) return;

    this.clearTimer('idleTimer');
    this.clearTimer('warningTimer');

    const { idleMs, idleWarningMs } = environment.session;

    if (idleWarningMs > 0 && idleWarningMs < idleMs) {
      this.warningTimer = setTimeout(() => {
        const minutes = Math.round(idleWarningMs / 60000);
        this.feedback.warn(
          `You will be signed out in about ${minutes} minute${minutes === 1 ? '' : 's'} due to inactivity.`
        );
      }, idleMs - idleWarningMs);
    }

    this.idleTimer = setTimeout(() => void this.requireReauth(), idleMs);
  }

  /**
   * Idle timeout reached. Ask for the password again without moving the user off
   * the page. If they decline, only then do we end the session.
   */
  private async requireReauth(): Promise<void> {
    if (!this.tokens.isAuthenticated() || this.reauthRequired()) return;

    this.reauthRequired.set(true);

    const { confirmed } = await this.dialogs.confirm({
      title: 'Still there?',
      message:
        'You have been inactive for a while. Continue your session to keep working — nothing on this page will be lost.',
      confirmLabel: 'Continue working',
      cancelLabel: 'Sign out',
    });

    if (!confirmed) {
      this.reauthRequired.set(false);
      await this.endSession();
      return;
    }

    // A live refresh both proves the session is still good server-side and
    // rotates the access token.
    const refreshed = await this.auth.refresh();
    this.reauthRequired.set(false);

    if (!refreshed) {
      await this.endSession('We could not restore your session. Sign in again to continue.');
      return;
    }

    this.resetIdleTimers();
  }

  private async endSession(message?: string): Promise<void> {
    const returnTo = this.router.url;
    this.stop();
    this.dialogs.dismissAll();
    this.feedback.dismissAll();
    await this.auth.logout();

    await this.router.navigate(['/auth/login'], {
      queryParams: returnTo && returnTo !== '/' ? { redirectTo: returnTo } : {},
    });

    if (message) this.feedback.info(message);
  }

  private listen(): void {
    if (this.listening) return;
    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, this.onActivity, { passive: true });
    }
    this.listening = true;
  }

  private unlisten(): void {
    if (!this.listening) return;
    for (const event of ACTIVITY_EVENTS) {
      document.removeEventListener(event, this.onActivity);
    }
    this.listening = false;
  }

  private clearTimer(key: 'idleTimer' | 'warningTimer' | 'absoluteTimer'): void {
    const timer = this[key];
    if (timer !== null) {
      clearTimeout(timer);
      this[key] = null;
    }
  }
}
