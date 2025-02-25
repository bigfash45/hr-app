import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { Roles } from '../auth/auth.decorators';
import {
  CreateEmployeeDto,
  DeactivateEmployeeDto,
  ListEmployeesQueryDto,
  UpdateEmployeeDto,
} from './employees.dto';

@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  /**
   * Open to every role — what each one actually sees is narrowed by
   * ScopeService: Group HR all companies, Local HR their company, Line Manager
   * their department and direct reports, Employee only themselves (PRD §7.1).
   */
  @Get()
  list(@Query() query: ListEmployeesQueryDto) {
    return this.employees.list(query);
  }

  /** Directory and org chart. Never carries sensitive fields. */
  @Get('org-chart')
  orgChart() {
    return this.employees.orgChart();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.findOne(id);
  }

  @Post()
  @Roles('LOCAL_HR_MANAGER', 'GROUP_HR_MANAGER')
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  /**
   * Line Managers may correct non-sensitive details for their team; the service
   * refuses salary, bank, and HR-note changes from anyone but Local HR (§7.2).
   */
  @Patch(':id')
  @Roles('LOCAL_HR_MANAGER', 'GROUP_HR_MANAGER', 'LINE_MANAGER')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(id, dto);
  }

  /** Retains history, revokes access, requires a logged reason (PRD §6.3). */
  @Post(':id/deactivate')
  @Roles('LOCAL_HR_MANAGER', 'GROUP_HR_MANAGER')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DeactivateEmployeeDto) {
    return this.employees.deactivate(id, dto);
  }
}
