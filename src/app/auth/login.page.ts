import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonComponent } from '../shared/button/button.component';
import { InputComponent } from '../shared/input/input.component';
import { FormFieldComponent } from '../shared/form-field/form-field.component';
import { NowNowLogoComponent } from '../shared/nownow-logo/nownow-logo.component';
import { DecorShapesComponent } from '../shared/decor-shapes/decor-shapes.component';

import { AuthService } from './auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonComponent, InputComponent, FormFieldComponent, NowNowLogoComponent, DecorShapesComponent],
  templateUrl: './login.page.html',
})
export class LoginPage {
  private fb = inject(NonNullableFormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  loading = signal(false);
  error = signal<string | null>(null);

  form = this.fb.group({
    companyCode: this.fb.control('001122', { validators: [Validators.required] }),
    username: this.fb.control('', { validators: [Validators.required, Validators.email] }),
    password: this.fb.control('', { validators: [Validators.required, Validators.minLength(6)] }),
  });

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const result = await this.auth.login(this.form.getRawValue());
    this.loading.set(false);
    if (!result.ok) {
      this.error.set(result.message || 'Login failed');
      return;
    }
    // Navigate to overview page after login success
    this.router.navigateByUrl('/overview');
  }
}
