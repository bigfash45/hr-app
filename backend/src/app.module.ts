import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { CoreModule } from './core/core.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { LeaveModule } from './modules/leave/leave.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { OverviewModule } from './modules/overview/overview.module';
import { TenantMiddleware } from './core/tenant/tenant.middleware';
import { JwtAuthGuard, RolesGuard } from './modules/auth/guards';
import { HttpProblemFilter } from './core/http/http-problem.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    CoreModule,
    AuthModule,
    NotificationsModule,
    EmployeesModule,
    AttendanceModule,
    LeaveModule,
    OverviewModule,
  ],
  providers: [
    // Order matters: authenticate, then check the role, then rate-limit.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },

    // One error envelope for the whole API, matching what the Angular
    // error-mapper expects.
    { provide: APP_FILTER, useClass: HttpProblemFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Every route, including public ones: unauthenticated requests still need a
    // correlation id on the response.
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
