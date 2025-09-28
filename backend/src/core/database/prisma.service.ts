import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TenantContext, currentTenant } from '../tenant/tenant-context';

/**
 * Prisma client that pushes the tenant context down into PostgreSQL so
 * Row-Level Security can act on it.
 *
 * The mechanism: RLS policies read `app.company_id` and `app.is_group_hr` from
 * the session. Those are set with `set_config(..., true)` — the `true` makes them
 * transaction-local, so they cannot leak to the next request that borrows the
 * same pooled connection. That detail is the whole ballgame: a
 * connection-scoped setting under a connection pool would hand one company's
 * scope to another company's request.
 *
 * Because of that, every tenant-scoped read or write must go through
 * `withTenant()`, which wraps it in a transaction. Queries issued directly on
 * this client run with no company set, and RLS then matches nothing — a
 * forgotten wrapper shows up as empty results, not as a leak.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Run `work` inside a transaction with the tenant context applied.
   *
   *   const employees = await prisma.withTenant(tx =>
   *     tx.employee.findMany({ where: { status: 'ACTIVE' } })
   *   );
   *
   * Note there is no `companyId` in that filter — RLS supplies it. Repositories
   * should still scope explicitly where it aids clarity; the policy is a net,
   * not a substitute for writing the query correctly.
   */
  async withTenant<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    context: TenantContext | null = currentTenant()
  ): Promise<T> {
    if (!context) {
      throw new Error(
        'withTenant() called with no tenant context. Bind one, or use the unscoped client deliberately.'
      );
    }

    return this.$transaction(async tx => {
      await this.applyTenantSettings(tx, context);
      return work(tx);
    });
  }

  /**
   * Escape hatch for the handful of operations that legitimately precede a
   * tenant: authenticating by email, exchanging a refresh token, health checks.
   *
   * Named to be conspicuous in review. If you are reaching for this to read
   * business data, you want `withTenant` instead.
   */
  async withoutTenantScope<T>(work: (client: PrismaClient) => Promise<T>): Promise<T> {
    return work(this);
  }

  private async applyTenantSettings(
    tx: Prisma.TransactionClient,
    context: TenantContext
  ): Promise<void> {
    const isGroupHr = context.role === 'GROUP_HR_MANAGER' ? 'on' : 'off';

    // Parameterised, and the third argument `true` scopes both to this
    // transaction only.
    await tx.$executeRaw`SELECT set_config('app.company_id', ${context.companyId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.is_group_hr', ${isGroupHr}, true)`;
  }
}
