import { Module } from '@nestjs/common';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { WorkingDaysService } from './working-days.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [LeaveController],
  providers: [LeaveService, WorkingDaysService],
  exports: [LeaveService, WorkingDaysService],
})
export class LeaveModule {}
