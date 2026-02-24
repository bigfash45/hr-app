import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { CompanyContextService } from '../../tenant/company-context.service';

/**
 * Attaches the active company to every request — PRD §11.4 multi-tenant scoping.
 *
 * This header is a *hint*, not a permission. The backend must derive the caller's
 * permitted company set from the token and reject a header that asks for
 * anything outside it; otherwise any user could read another company's data by
 * editing one request. Row-Level Security at the database layer is the second
 * line of defence (PRD §11.4).
 *
 * Pending backend confirmation (plan decision D3): whether company scope travels
 * as this header or as a JWT claim. If it becomes a claim, delete this file —
 * don't leave a header the server ignores.
 */
export const tenantInterceptor: HttpInterceptorFn = (req, next) => {
  const companyId = inject(CompanyContextService).activeCompanyId();
  if (!companyId) return next(req);
  return next(req.clone({ setHeaders: { 'X-Company-Id': companyId } }));
};
