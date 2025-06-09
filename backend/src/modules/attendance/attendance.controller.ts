import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { Roles } from '../auth/auth.decorators';
import {
  DecideCorrectionDto,
  ListAttendanceQueryDto,
  ManualAttendanceDto,
  RequestCorrectionDto,
} from './attendance.dto';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  /** State for the clock-in widget. */
  @Get('today')
  today() {
    return this.attendance.todayForCurrentUser();
  }

  @Post('clock-in')
  clockIn() {
    return this.attendance.clockIn();
  }

  @Post('clock-out')
  clockOut() {
    return this.attendance.clockOut();
  }

  /** History, narrowed to what the caller's role may see. */
  @Get('records')
  list(@Query() query: ListAttendanceQueryDto) {
    return this.attendance.list(query);
  }

  /** Today's roll-call: team for a Line Manager, company for HR. */
  @Get('summary/today')
  todaySummary() {
    return this.attendance.todaySummary();
  }

  @Get('corrections')
  listCorrections() {
    return this.attendance.listCorrections();
  }

  @Post('corrections')
  requestCorrection(@Body() dto: RequestCorrectionDto) {
    return this.attendance.requestCorrection(dto);
  }

  @Post('corrections/:id/decision')
  @Roles('LINE_MANAGER', 'LOCAL_HR_MANAGER', 'GROUP_HR_MANAGER')
  decideCorrection(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideCorrectionDto) {
    return this.attendance.decideCorrection(id, dto);
  }

  /** HR override — mark WFH, an absence, or fix a record (PRD §6.4). */
  @Post('manual')
  @Roles('LOCAL_HR_MANAGER', 'GROUP_HR_MANAGER')
  manualEntry(@Body() dto: ManualAttendanceDto) {
    return this.attendance.manualEntry(dto);
  }
}
