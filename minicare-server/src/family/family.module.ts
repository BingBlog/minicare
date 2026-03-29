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
  exports: [FamilyMemberGuard, RoleGuard],  // 导出供 records/ 模块使用
})
export class FamilyModule {}
