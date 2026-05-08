import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { FamilyMemberGuard } from '../family/family-member.guard';
import { RoleGuard } from '../family/role.guard';
import { ReportService } from './report.service';
import { BabyService } from '../baby/baby.service';
import type { ReportSummary, ChartData } from './report.service';
import { getBeijingToday, addDays } from '../common/utils/date.util';

/** 默认时间范围：最近7天（process.env.TZ = 'Asia/Shanghai' 已生效） */
function defaultRange(): { startDate: string; endDate: string } {
  const endDate = getBeijingToday();
  const startDate = addDays(endDate, -6);
  return { startDate, endDate };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

@ApiTags('report')
@Controller('family/:familyId/report')
@UseGuards(JwtGuard, FamilyMemberGuard, RoleGuard)
@ApiBearerAuth()
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    private readonly babyService: BabyService,
  ) {}

  /**
   * 获取报告聚合数据（不自动保存）
   * GET /api/family/:familyId/report/summary?babyId=&startDate=&endDate=
   */
  @Get('summary')
  @ApiOperation({ summary: '获取报告聚合统计数据' })
  @ApiQuery({ name: 'babyId',    required: false })
  @ApiQuery({ name: 'startDate', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate',   required: false, description: 'YYYY-MM-DD' })
  async getSummary(
    @Param('familyId') familyId: string,
    @Query('babyId')    babyIdParam: string | undefined,
    @Query('startDate') startDateParam: string | undefined,
    @Query('endDate')   endDateParam: string | undefined,
  ) {
    const babyId = await this.resolveBabyId(familyId, babyIdParam);
    const { startDate, endDate } = this.resolveDateRange(startDateParam, endDateParam);
    return this.reportService.getSummary(babyId, startDate, endDate);
  }

  /**
   * 生成并保存报告快照
   * POST /api/family/:familyId/report/save
   * body: { babyId?, startDate?, endDate?, title? }
   * 
   * 返回 { id, summary }，前端可直接展示
   */
  @Post('save')
  @ApiOperation({ summary: '生成报告并持久化快照' })
  async saveReport(
    @Param('familyId') familyId: string,
    @Body() body: { babyId?: string; startDate?: string; endDate?: string; title?: string },
  ) {
    const babyId = await this.resolveBabyId(familyId, body.babyId);
    const { startDate, endDate } = this.resolveDateRange(body.startDate, body.endDate);

    const summary: ReportSummary = await this.reportService.getSummary(babyId, startDate, endDate);
    const { id } = await this.reportService.saveReport(familyId, summary, body.title ?? '综合报告');
    return { id, summary };
  }

  /**
   * 获取图表逐日数据（已废弃：请使用 /chart-data/:module 按 Tab 独立接口）
   * GET /api/family/:familyId/report/chart-data?babyId=&startDate=&endDate=
   * @deprecated
   */
  @Get('chart-data')
  @ApiOperation({ summary: '获取图表逐日数据（已废弃，使用 chart-data/:module）', deprecated: true })
  @ApiQuery({ name: 'babyId',    required: false })
  @ApiQuery({ name: 'startDate', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate',   required: false, description: 'YYYY-MM-DD' })
  async getChartData(
    @Param('familyId') familyId: string,
    @Query('babyId')    babyIdParam: string | undefined,
    @Query('startDate') startDateParam: string | undefined,
    @Query('endDate')   endDateParam: string | undefined,
  ): Promise<ChartData> {
    const babyId = await this.resolveBabyId(familyId, babyIdParam);
    const { startDate, endDate } = this.resolveDateRange(startDateParam, endDateParam);
    return this.reportService.getChartData(babyId, startDate, endDate);
  }

  /**
   * 饮食分析逐日数据
   * GET /api/family/:familyId/report/chart-data/feeding?babyId=&startDate=&endDate=
   */
  @Get('chart-data/feeding')
  @ApiOperation({ summary: '饮食分析逐日数据' })
  @ApiQuery({ name: 'babyId',    required: false })
  @ApiQuery({ name: 'startDate', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate',   required: false, description: 'YYYY-MM-DD' })
  async getChartFeeding(
    @Param('familyId') familyId: string,
    @Query('babyId')    babyIdParam: string | undefined,
    @Query('startDate') startDateParam: string | undefined,
    @Query('endDate')   endDateParam: string | undefined,
  ) {
    const babyId = await this.resolveBabyId(familyId, babyIdParam);
    const { startDate, endDate } = this.resolveDateRange(startDateParam, endDateParam);
    return this.reportService.getDailyFeedingData(babyId, startDate, endDate);
  }

  /**
   * 尿布分析逐日数据
   * GET /api/family/:familyId/report/chart-data/diaper?babyId=&startDate=&endDate=
   */
  @Get('chart-data/diaper')
  @ApiOperation({ summary: '尿布分析逐日数据' })
  @ApiQuery({ name: 'babyId',    required: false })
  @ApiQuery({ name: 'startDate', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate',   required: false, description: 'YYYY-MM-DD' })
  async getChartDiaper(
    @Param('familyId') familyId: string,
    @Query('babyId')    babyIdParam: string | undefined,
    @Query('startDate') startDateParam: string | undefined,
    @Query('endDate')   endDateParam: string | undefined,
  ) {
    const babyId = await this.resolveBabyId(familyId, babyIdParam);
    const { startDate, endDate } = this.resolveDateRange(startDateParam, endDateParam);
    return this.reportService.getDailyDiaperData(babyId, startDate, endDate);
  }

  /**
   * 睡眠分析逐日数据
   * GET /api/family/:familyId/report/chart-data/sleep?babyId=&startDate=&endDate=
   */
  @Get('chart-data/sleep')
  @ApiOperation({ summary: '睡眠分析逐日数据' })
  @ApiQuery({ name: 'babyId',    required: false })
  @ApiQuery({ name: 'startDate', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate',   required: false, description: 'YYYY-MM-DD' })
  async getChartSleep(
    @Param('familyId') familyId: string,
    @Query('babyId')    babyIdParam: string | undefined,
    @Query('startDate') startDateParam: string | undefined,
    @Query('endDate')   endDateParam: string | undefined,
  ) {
    const babyId = await this.resolveBabyId(familyId, babyIdParam);
    const { startDate, endDate } = this.resolveDateRange(startDateParam, endDateParam);
    return this.reportService.getDailySleepData(babyId, startDate, endDate);
  }

  /**
   * 健康分析逐日数据（体温 + mood + spirit）
   * GET /api/family/:familyId/report/chart-data/health?babyId=&startDate=&endDate=
   */
  @Get('chart-data/health')
  @ApiOperation({ summary: '健康分析逐日数据（体温/情绪/精神状态）' })
  @ApiQuery({ name: 'babyId',    required: false })
  @ApiQuery({ name: 'startDate', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate',   required: false, description: 'YYYY-MM-DD' })
  async getChartHealth(
    @Param('familyId') familyId: string,
    @Query('babyId')    babyIdParam: string | undefined,
    @Query('startDate') startDateParam: string | undefined,
    @Query('endDate')   endDateParam: string | undefined,
  ) {
    const babyId = await this.resolveBabyId(familyId, babyIdParam);
    const { startDate, endDate } = this.resolveDateRange(startDateParam, endDateParam);
    return this.reportService.getDailyHealthData(babyId, startDate, endDate);
  }

  /**
   * 生长发育全量记录（用于生长曲线）
   * GET /api/family/:familyId/report/chart-data/growth?babyId=&startDate=&endDate=
   */
  @Get('chart-data/growth')
  @ApiOperation({ summary: '生长发育记录（用于生长曲线）' })
  @ApiQuery({ name: 'babyId',    required: false })
  @ApiQuery({ name: 'startDate', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate',   required: false, description: 'YYYY-MM-DD' })
  async getChartGrowth(
    @Param('familyId') familyId: string,
    @Query('babyId')    babyIdParam: string | undefined,
    @Query('startDate') startDateParam: string | undefined,
    @Query('endDate')   endDateParam: string | undefined,
  ) {
    const babyId = await this.resolveBabyId(familyId, babyIdParam);
    const { startDate, endDate } = this.resolveDateRange(startDateParam, endDateParam);
    return this.reportService.getGrowthRecords(babyId, startDate, endDate);
  }

  /**
   * 历史报告列表
   * GET /api/family/:familyId/report/history?babyId=&limit=10
   */
  @Get('history')
  @ApiOperation({ summary: '获取已保存的历史报告列表' })
  @ApiQuery({ name: 'babyId', required: false })
  @ApiQuery({ name: 'limit',  required: false, description: '最多返回条数，默认10' })
  async listHistory(
    @Param('familyId') familyId: string,
    @Query('babyId') babyIdParam: string | undefined,
    @Query('limit')  limitParam: string | undefined,
  ) {
    const babyId = await this.resolveBabyId(familyId, babyIdParam);
    const limit = Math.min(50, Math.max(1, parseInt(limitParam ?? '10', 10) || 10));
    return this.reportService.listSavedReports(familyId, babyId, limit);
  }

  /**
   * 单份历史报告详情（含完整 summary JSON）
   * GET /api/family/:familyId/report/history/:reportId
   */
  @Get('history/:reportId')
  @ApiOperation({ summary: '获取某份已保存报告的完整内容' })
  async getHistoryItem(
    @Param('familyId') familyId: string,
    @Param('reportId') reportId: string,
  ) {
    const report = await this.reportService.getSavedReport(reportId, familyId);
    if (!report) {
      throw new NotFoundException('报告不存在或无权访问');
    }
    return report;
  }

  // ── 私有辅助 ──────────────────────────────────────────────────
  private async resolveBabyId(familyId: string, babyIdParam?: string): Promise<string> {
    if (babyIdParam) return babyIdParam;
    const baby = await this.babyService.getBabyByFamily(familyId);
    return baby.id as string;
  }

  private resolveDateRange(startParam?: string, endParam?: string) {
    const { startDate: defStart, endDate: defEnd } = defaultRange();
    const startDate = startParam ?? defStart;
    const endDate   = endParam   ?? defEnd;

    if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
      throw new BadRequestException('日期格式必须为 YYYY-MM-DD');
    }
    if (startDate > endDate) {
      throw new BadRequestException('startDate 不能晚于 endDate');
    }
    return { startDate, endDate };
  }
}
