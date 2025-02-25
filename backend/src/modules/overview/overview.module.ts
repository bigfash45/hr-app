import { Controller, Get, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OverviewService } from './overview.service';
import { AttendanceModule } from '../attendance/attendance.module';

@ApiTags('overview')
@ApiBearerAuth()
@Controller('overview')
class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  /** Stat cards. Scoped by role — a Line Manager sees their team's numbers. */
  @Get('stats')
  stats() {
    return this.overview.stats();
  }

  /** Recent activity, from the audit log. */
  @Get('activity')
  activity() {
    return this.overview.activity();
  }

  /** Public holidays and payroll dates, next 60 days. */
  @Get('events')
  events() {
    return this.overview.events();
  }
}

@Module({
  imports: [AttendanceModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
