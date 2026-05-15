import { Injectable, computed, inject, signal } from '@angular/core';
import { TokenStore } from '../auth/token-store';

export interface Company {
  id: string;
  name: string;
}

/**
 * Which company the user is currently looking at — PRD §11.4.
 *
 * For every role except Group HR Manager this is fixed to the company on their
 * own record and cannot be changed. A Group HR Manager works across the group
 * and can drill into one company at a time; `activeCompanyId` is what the tenant
 * interceptor sends, and what the backend must scope its queries by.
 *
 * The client-side value is a convenience for the UI. Server-side scoping is the
 * real boundary (PRD §7.3) — a forged header must not widen anyone's access.
 */
@Injectable({ providedIn: 'root' })
export class CompanyContextService {
  private tokens = inject(TokenStore);

  /** Only meaningful for Group HR; null means "the user's own company". */
  private readonly override = signal<string | null>(null);

  /** Companies a Group HR Manager may switch between. Populated after login. */
  private readonly _available = signal<Company[]>([]);
  readonly available = this._available.asReadonly();

  readonly canSwitch = computed(() => this.tokens.role() === 'GROUP_HR_MANAGER');

  readonly activeCompanyId = computed(
    () => this.override() ?? this.tokens.user()?.companyId ?? null
  );

  readonly activeCompanyName = computed(() => {
    const id = this.activeCompanyId();
    const match = this._available().find(c => c.id === id);
    return match?.name ?? this.tokens.user()?.companyName ?? null;
  });

  setAvailable(companies: Company[]): void {
    this._available.set(companies);
  }

  /** Ignored for anyone who is not a Group HR Manager. */
  switchTo(companyId: string | null): void {
    if (!this.canSwitch()) return;
    this.override.set(companyId);
  }

  clear(): void {
    this.override.set(null);
    this._available.set([]);
  }
}
