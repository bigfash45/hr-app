import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LeaveService } from './leave.service';
import { Roles } from '../auth/auth.decorators';
import {
  AdjustBalanceDto,
  ApplyLeaveDto,
  CalendarQueryDto,
  DecideLeaveDto,
  ListLeaveQueryDto,
} from './leave.dto';

@ApiTags('leave')
@ApiBearerAuth()
@Controller('leave')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  /** Scoped by role: own requests, team's, company's, or the group's. */
  @Get('requests')
  list(@Query() query: ListLeaveQueryDto) {
    return this.leave.list(query);
  }

  @Get('requests/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.leave.findOne(id);
  }

  @Post('requests')
  apply(@Body() dto: ApplyLeaveDto) {
    return this.leave.apply(dto);
  }

  /**
   * Approve or reject. Which levels the caller may act at is decided in the
   * service — including the rule that nobody approves their own request.
   */
  @Post('requests/:id/decision')
  @Roles('LINE_MANAGER', 'LOCAL_HR_MANAGER', 'GROUP_HR_MANAGER')
  decide(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideLeaveDto) {
    return this.leave.decide(id, dto);
  }

  /** Own balances by default; HR and managers may pass an employeeId. */
  @Get('balances')
  balances(@Query('employeeId') employeeId?: string) {
    return this.leave.balances(employeeId ?? null);
  }

  @Post('balances/adjust')
  @Roles('LOCAL_HR_MANAGER', 'GROUP_HR_MANAGER')
  adjustBalance(@Body() dto: AdjustBalanceDto) {
    return this.leave.adjustBalance(dto);
  }

  @Get('calendar')
  calendar(@Query() query: CalendarQueryDto) {
    return this.leave.calendar(query.from, query.to);
  }
}
