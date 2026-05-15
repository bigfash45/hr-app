import { AppError } from '../errors/app-error';

/** A labelled fact shown in a dialog body, e.g. "Duration — 5 working days". */
export interface DialogDetail {
  label: string;
  value: string;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` styles the confirm action destructively. */
  tone?: 'default' | 'danger';
  /**
   * Require a typed reason before confirming. Used wherever the PRD mandates a
   * logged justification: employee deactivation (§6.3), leave balance
   * adjustment (§6.5), attendance override (§6.4). The reason is mandatory in
   * the dialog because it is mandatory in the audit log.
   */
  requireReason?: boolean;
  reasonLabel?: string;
}

export interface ConfirmResult {
  confirmed: boolean;
  reason?: string;
}

export interface SuccessOptions {
  title: string;
  message?: string;
  details?: DialogDetail[];
  /** Primary action label. Defaults to "Done". */
  primaryLabel?: string;
  /** Optional secondary action, e.g. "Add another". */
  secondaryLabel?: string;
}

/** Which button closed a success dialog. */
export type SuccessResult = 'primary' | 'secondary' | 'dismiss';

export type DialogRequest =
  | { kind: 'confirm'; id: number; options: ConfirmOptions }
  | { kind: 'success'; id: number; options: SuccessOptions }
  | { kind: 'error'; id: number; error: AppError; onRetry?: () => void };
