import { Module, forwardRef } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { SleepModule } from '../records/sleep/sleep.module';

@Module({
  imports: [forwardRef(() => SleepModule)],
  providers: [TasksService],
})
export class SchedulerModule {}
