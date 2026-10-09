import { Module } from '@nestjs/common';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';
import { FamilyMemberGuard } from './family-member.guard';
import { RoleGuard } from './role.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [FamilyController],
  providers: [FamilyService, FamilyMemberGuard, RoleGuard],
  exports: [FamilyMemberGuard, RoleGuard, FamilyService],  // 守卫供 records/ 使用；FamilyService 供 schedule/ 复用 getTodayRecords
})
export class FamilyModule {}
