import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, requireTenant } from '../tenant/tenant-context';

/**
 * Turns a role into a query filter, and answers "may this person act on that
 * record?" — PRD §7.1 data scoping.
 *
 * Centralised because the rule is easy to state and easy to get subtly wrong in
 * each of nine modules:
 *
 *   Group HR Manager  — all companies
 *   Local HR Manager  — own company
 *   Line Manager      — own department
 *   Employee          — own records only
 */
@Injectable()
export class ScopeService {
  /**
   * A `where` fragment restricting employee queries to what the caller may see.
   * RLS already bounds this to the company; this narrows it further by role.
   */
  employeeScope(context: TenantContext = requireTenant()): Prisma.EmployeeWhereInput {
    switch (context.role) {
      case 'GROUP_HR_MANAGER':
        return {};

      case 'LOCAL_HR_MANAGER':
        return { companyId: context.companyId };

      case 'LINE_MANAGER':
        // Their department, plus anyone reporting to them — the two can differ
        // when someone reports across department lines.
        return {
          companyId: context.companyId,
          OR: [
            context.departmentId ? { departmentId: context.departmentId } : { id: '__none__' },
            { managerId: context.employeeId ?? '__none__' },
            { id: context.employeeId ?? '__none__' },
          ],
        };

      case 'EMPLOYEE':
      default:
        return { id: context.employeeId ?? '__none__' };
    }
  }

  /** True when the caller may read this employee's record at all. */
  canViewEmployee(employee: { id: string; companyId: string; departmentId: string | null; managerId: string | null }, context: TenantContext = requireTenant()): boolean {
    if (context.role === 'GROUP_HR_MANAGER') return true;
    if (employee.companyId !== context.companyId) return false;
    if (context.role === 'LOCAL_HR_MANAGER') return true;

    if (context.role === 'LINE_MANAGER') {
      return (
        employee.id === context.employeeId ||
        employee.managerId === context.employeeId ||
        (!!context.departmentId && employee.departmentId === context.departmentId)
      );
    }
    return employee.id === context.employeeId;
  }

  /**
   * Tier 1 fields — salary, bank, RSA PIN, NIN, BVN.
   * Local HR, or the employee looking at their own record (PRD §7.2).
   */
  canViewSensitiveFields(employeeId: string, context: TenantContext = requireTenant()): boolean {
    if (context.role === 'LOCAL_HR_MANAGER') return true;
    if (context.role === 'GROUP_HR_MANAGER') return false; // group-level analytics, not individual pay
    return context.employeeId === employeeId;
  }

  /** HR internal notes — Local HR only (PRD §7.2). */
  canViewHrNotes(context: TenantContext = requireTenant()): boolean {
    return context.role === 'LOCAL_HR_MANAGER';
  }

  /**
   * "A user can never approve their own request" (PRD §7.3).
   *
   * Enforced here rather than in each workflow so it cannot be forgotten in one
   * of them. Where it bites, the request routes to the next level up instead.
   */
  assertNotSelfApproval(requesterEmployeeId: string, context: TenantContext = requireTenant()): void {
    if (context.employeeId && context.employeeId === requesterEmployeeId) {
      throw new ForbiddenException(
        'You cannot approve your own request. It has been routed to the next level for review.'
      );
    }
  }

  assertCanViewEmployee(
    employee: { id: string; companyId: string; departmentId: string | null; managerId: string | null },
    context: TenantContext = requireTenant()
  ): void {
    if (!this.canViewEmployee(employee, context)) {
      throw new ForbiddenException('You do not have access to this employee record.');
    }
  }
}
