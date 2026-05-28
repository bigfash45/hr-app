import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonComponent } from '../shared/button/button.component';
import { InputComponent } from '../shared/input/input.component';
import { FormFieldComponent } from '../shared/form-field/form-field.component';
import { NowNowLogoComponent } from '../shared/nownow-logo/nownow-logo.component';
import { DecorShapesComponent } from '../shared/decor-shapes/decor-shapes.component';

import { AuthService } from '../core/auth/auth.service';
import { SessionService } from '../core/auth/session.service';
import { ROLE_HOME } from '../core/auth/role.model';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonComponent,
    InputComponent,
    FormFieldComponent,
    NowNowLogoComponent,
    DecorShapesComponent,
  ],
  templateUrl: './login.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private fb = inject(NonNullableFormBuilder);
  private auth = inject(AuthService);
  private session = inject(SessionService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly loading = signal(false);
  /** Sign-in failures render inline, never as a modal — see plan §5.3. */
  readonly error = signal<string | null>(null);

  form = this.fb.group({
    // No prefilled value: the old default ('001122') shipped a real tenant
    // identifier in the bundle.
    companyCode: this.fb.control('', { validators: [Validators.required] }),
    // PRD §6.1 describes email + password, but the dev API's field is
    // `username` and may accept non-email logins. Kept permissive on purpose —
    // tighten to Validators.email once the backend confirms the format, rather
    // than risk locking out a valid account today.
    username: this.fb.control('', { validators: [Validators.required] }),
    password: this.fb.control('', { validators: [Validators.required, Validators.minLength(6)] }),
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const result = await this.auth.login(this.form.getRawValue());
    this.loading.set(false);

    if (!result.ok) {
      // Already generic by the time it reaches us — the mapper never reveals
      // which field was wrong (PRD §6.1).
      this.error.set(result.error.message);
      return;
    }

    // Start the 8h absolute / 30min idle clocks only once a session exists.
    this.session.start();

    // Honour where the user was headed before the guard intervened, then fall
    // back to their role's home.
    const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo');
    const role = this.auth.role();
    await this.router.navigateByUrl(redirectTo || (role ? ROLE_HOME[role] : '/overview'));
  }
}
