import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BabyService } from './baby.service';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('baby')
@Controller('baby')
@UseGuards(JwtGuard)
@ApiBearerAuth()
export class BabyMineController {
  constructor(private readonly babyService: BabyService) {}

  @Get('mine')
  @ApiOperation({ summary: '获取当前用户所有家庭下的宝宝列表（跨家庭）' })
  getMyBabies(@CurrentUser() userId: string) {
    return this.babyService.getMyBabies(userId);
  }
}
