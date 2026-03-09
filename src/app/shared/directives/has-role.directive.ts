import { Directive, Input, TemplateRef, ViewContainerRef, effect, inject, signal } from '@angular/core';
import { TokenStore } from '../../core/auth/token-store';
import { Role } from '../../core/auth/role.model';

/**
 * Renders content only for the listed roles:
 *
 *   <button *appHasRole="['LOCAL_HR_MANAGER']">Adjust balance</button>
 *   <span *appHasRole="'GROUP_HR_MANAGER'">Group totals</span>
 *
 * IMPORTANT: this is cosmetic. PRD §7.3 is explicit that frontend hiding of
 * controls is supplementary only — every permission must be enforced
 * server-side. Hiding a button prevents an honest mistake; it prevents nothing
 * else. Never let this be the only thing between a user and an action.
 */
@Directive({
  selector: '[appHasRole]',
  standalone: true,
})
export class HasRoleDirective {
  private template = inject<TemplateRef<unknown>>(TemplateRef);
  private view = inject(ViewContainerRef);
  private tokens = inject(TokenStore);

  /** A signal, so the effect below re-runs when the allowed list changes too. */
  private readonly allowed = signal<Role[]>([]);
  private rendered = false;

  constructor() {
    effect(() => {
      const role = this.tokens.role();
      const shouldRender = role !== null && this.allowed().includes(role);

      if (shouldRender === this.rendered) return;

      if (shouldRender) {
        this.view.createEmbeddedView(this.template);
      } else {
        // Also covers sign-out, so privileged controls do not linger on screen.
        this.view.clear();
      }
      this.rendered = shouldRender;
    });
  }

  @Input({ required: true })
  set appHasRole(value: Role | Role[]) {
    this.allowed.set(Array.isArray(value) ? value : [value]);
  }
}
