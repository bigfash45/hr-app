import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-form-field',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './form-field.component.html',
})
export class FormFieldComponent {
  @Input() label!: string;
  @Input() hint?: string;
  @Input() error?: string | null;
}
