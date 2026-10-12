import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MedicalService } from './medical.service';
import { VaccineBookService } from './vaccine-book.service';
import { JwtGuard } from '../../auth/jwt.guard';
import { FamilyMemberGuard } from '../../family/family-member.guard';
import { RoleGuard } from '../../family/role.guard';
import { CreateMedicalDto, UpdateMedicalDto } from './dto/create-medical.dto';
import { ParseImagesDto } from './dto/parse-images.dto';
import { VaccineSettingDto } from './dto/vaccine-setting.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinRole, FamilyRole } from '../../common/decorators/min-role.decorator';

@ApiTags('records/medical')
@Controller('family/:familyId/records/medical')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class MedicalController {
  constructor(
    private readonly medicalService: MedicalService,
    private readonly vaccineBookService: VaccineBookService,
  ) {}

  @Post() @MinRole(FamilyRole.MEMBER)
  create(@CurrentUser() userId: string, @Body() dto: CreateMedicalDto) {
    return this.medicalService.create(userId, dto);
  }

  @Get()
  findAll(@Query('baby_id') babyId: string, @Query('before_date') beforeDate?: string) {
    return this.medicalService.findAll(babyId, beforeDate);
  }

  /** 下次复查提醒（首页展示）：未来最近一条，无则最近过期一条标记 overdue，均无返回 null */
  @Get('next-follow-up')
  getNextFollowUp(@Query('baby_id') babyId: string) {
    return this.medicalService.findNextFollowUp(babyId);
  }

  // ── 020 类型化资源端点（⚠️ 静态路由必须声明在 @Get(':id') 之前）──

  /** 全量 keyset 分页档案（儿保档案/疫苗历史/就诊历史/记录流）；visit_type 可选 */
  @Get('archive')
  archive(
    @Query('baby_id') babyId: string,
    @Query('visit_type') visitType?: string,
    @Query('before_date') beforeDate?: string,
  ) {
    return this.medicalService.archive(babyId, visitType, beforeDate);
  }

  /** 疫苗参考程序库全量（疫苗本/疫苗记录联想） */
  @Get('vaccine/schedule')
  vaccineSchedule() {
    return this.vaccineBookService.listSchedule();
  }

  /** 疫苗本：程序进度状态机（US-03） */
  @Get('vaccine/book')
  vaccineBook(@Query('baby_id') babyId: string) {
    return this.vaccineBookService.getBook(babyId);
  }

  /** 宝宝级疫苗偏好 upsert（跟踪/替代标记） */
  @Patch('vaccine/settings') @MinRole(FamilyRole.MEMBER)
  vaccineSettings(@CurrentUser() userId: string, @Body() dto: VaccineSettingDto) {
    return this.vaccineBookService.upsertSetting(userId, dto);
  }

  /** 识图解析（PRD-017/TECH-035）：解析不落库，结果由前端确认后随保存提交（documents） */
  @Post('parse-images') @MinRole(FamilyRole.MEMBER)
  parseImages(@Param('familyId') familyId: string, @Body() dto: ParseImagesDto) {
    return this.medicalService.parseImages(familyId, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.medicalService.findOne(id);
  }

  @Patch(':id') @MinRole(FamilyRole.MEMBER)
  update(@CurrentUser() userId: string, @Param('id') id: string, @Body() dto: UpdateMedicalDto) {
    return this.medicalService.update(id, userId, dto);
  }

  @Delete(':id') @MinRole(FamilyRole.MEMBER)
  remove(@Param('id') id: string) { return this.medicalService.remove(id); }
}
